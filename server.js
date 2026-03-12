
const express = require('express');
const bodyParser = require('body-parser');
const Imap = require('node-imap');
const cors = require('cors');
const path = require('path');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const session = require('cookie-session');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');

// Configure multer for file uploads
const isVercel = process.env.VERCEL === '1';
const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max per file
});

const app = express();
app.set('trust proxy', 1);
const port = 3000;

// CORS must be before session
app.use(cors({
    origin: true,
    credentials: true
}));

// Body parser middleware - IMPORTANT: Must be before routes!
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration (Optimized for Vercel)
app.use(session({
    name: 'outlook_session',
    keys: [process.env.SESSION_SECRET || 'outlook-ai-secret-key-12345'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false, // Set to false to work reliably through Vercel's proxy
    httpOnly: true,
    sameSite: 'lax'
}));
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// Create temp directory for attachments
const tempDir = isVercel ? '/tmp/temp' : path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Encryption helper functions
function encrypt(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32, '0').substring(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, key) {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.padEnd(32, '0').substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// IMAP Config helper
function getImapConfig(email, password) {
    return {
        user: email,
        password: password,
        host: 'mail.labo-nedjma.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 30000,
        authTimeout: 15000
    };
}

// Login endpoint with session
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.getBoxes((err, boxes) => {
            imap.end();

            if (responseSent) return;
            responseSent = true;

            if (err) {
                return res.status(500).json({ success: false, message: 'Login successful, but failed to fetch boxes: ' + err.message });
            }

            // Store encrypted password in session
            const sessionKey = crypto.randomBytes(16).toString('hex');
            req.session.email = email;
            req.session.password = encrypt(password, sessionKey);
            req.session.sessionKey = sessionKey;
            req.session.lastSeen = Date.now(); // Force update for cookie-session

            const boxList = [];
            const parseBoxes = (boxObj, prefix = '') => {
                for (const key in boxObj) {
                    boxList.push(prefix + key);
                    if (boxObj[key].children) {
                        parseBoxes(boxObj[key].children, prefix + key + '/');
                    }
                }
            };
            parseBoxes(boxes);

            return res.json({ success: true, message: 'Authenticated successfully via IMAP!', boxes: boxList });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;

        let errorMsg = err.message;
        if (err.source === 'authentication') {
            errorMsg = 'Authentication failed. Please check your credentials.';
        }
        return res.status(401).json({ success: false, message: errorMsg });
    });

    imap.once('end', () => {
        // Connection ended
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Session check middleware
function requireAuth(req, res, next) {
    if (!req.session.email || !req.session.password) {
        return res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
    }
    next();
}

// Fetch emails from a folder
app.post('/api/emails', requireAuth, (req, res) => {
    const { folder = 'INBOX', limit = 50 } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    const emails = [];
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox(folder, true, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open folder: ' + err.message });
            }

            if (box.messages.total === 0) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.json({ success: true, emails: [] });
            }

            // Get the last N messages
            const start = Math.max(1, box.messages.total - limit + 1);
            const end = box.messages.total;

            const fetch = imap.seq.fetch(`${start}:${end}`, {
                bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
                struct: true
            });

            fetch.on('message', (msg, seqno) => {
                const emailData = { seqno };

                msg.on('body', (stream, info) => {
                    let buffer = '';
                    stream.on('data', (chunk) => {
                        buffer += chunk.toString('utf8');
                    });
                    stream.on('end', () => {
                        const parsed = Imap.parseHeader(buffer);
                        emailData.from = parsed.from ? parsed.from[0] : '';
                        emailData.to = parsed.to ? parsed.to[0] : '';
                        emailData.subject = parsed.subject ? parsed.subject[0] : '(Sans objet)';
                        emailData.date = parsed.date ? parsed.date[0] : '';
                    });
                });

                msg.once('attributes', (attrs) => {
                    emailData.uid = attrs.uid;
                    emailData.seen = attrs.flags.includes('\\Seen');
                    emailData.flagged = attrs.flags.includes('\\Flagged');
                });

                msg.once('end', () => {
                    // Extract sender name from "Name <email>" format
                    if (emailData.from) {
                        const match = emailData.from.match(/^"?([^"<]+)"?\s*<?/);
                        if (match) {
                            emailData.fromName = match[1].trim();
                        }
                    }
                    emailData.preview = '';
                    emails.push(emailData);
                });
            });

            fetch.once('error', (err) => {
                console.error('Fetch error:', err);
            });

            fetch.once('end', () => {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                // Sort by date descending (newest first)
                emails.sort((a, b) => new Date(b.date) - new Date(a.date));
                return res.json({ success: true, emails, total: box.messages.total });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// ============================================
// UNREAD COUNT API - For notifications
// ============================================

app.post('/api/unread-count', requireAuth, (req, res) => {
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open INBOX: ' + err.message });
            }

            // Search for UNSEEN (unread) emails
            imap.search(['UNSEEN'], (err, uids) => {
                imap.end();
                if (responseSent) return;
                responseSent = true;

                if (err) {
                    return res.status(500).json({ success: false, message: 'Search failed: ' + err.message });
                }

                return res.json({
                    success: true,
                    unreadCount: uids ? uids.length : 0
                });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// ============================================
// INBOX SMART - Smart Email Classification
// ============================================

// Get unread emails classified by date (Today, Yesterday, Before Yesterday)
app.post('/api/inbox-smart', requireAuth, (req, res) => {
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    // Helper to get date boundaries
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const beforeYesterday = new Date(today);
    beforeYesterday.setDate(beforeYesterday.getDate() - 2);

    imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open INBOX: ' + err.message });
            }

            // Search for UNSEEN (unread) emails
            imap.search(['UNSEEN'], (err, uids) => {
                if (err) {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;
                    return res.status(500).json({ success: false, message: 'Search failed: ' + err.message });
                }

                if (!uids || uids.length === 0) {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;
                    return res.json({
                        success: true,
                        today: [],
                        yesterday: [],
                        beforeYesterday: [],
                        older: [],
                        stats: { total: 0, today: 0, yesterday: 0, beforeYesterday: 0, older: 0 }
                    });
                }

                const emails = [];
                const fetch = imap.fetch(uids, {
                    bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'],
                    struct: true
                });

                fetch.on('message', (msg, seqno) => {
                    const emailData = { seqno };

                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                        stream.on('end', () => {
                            const parsed = Imap.parseHeader(buffer);
                            emailData.from = parsed.from ? parsed.from[0] : '';
                            emailData.to = parsed.to ? parsed.to[0] : '';
                            emailData.subject = parsed.subject ? parsed.subject[0] : '(Sans objet)';
                            emailData.date = parsed.date ? parsed.date[0] : '';
                        });
                    });

                    msg.once('attributes', (attrs) => {
                        emailData.uid = attrs.uid;
                        emailData.flags = attrs.flags;
                    });

                    msg.once('end', () => {
                        // Extract sender name
                        if (emailData.from) {
                            const match = emailData.from.match(/^"?([^"<]+)"?\s*<?/);
                            if (match) {
                                emailData.fromName = match[1].trim();
                            }
                        }
                        emails.push(emailData);
                    });
                });

                fetch.once('error', (err) => {
                    console.error('Fetch error:', err);
                });

                fetch.once('end', () => {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;

                    // Classify emails by date
                    const todayEmails = [];
                    const yesterdayEmails = [];
                    const beforeYesterdayEmails = [];
                    const olderEmails = [];

                    emails.forEach(email => {
                        const emailDate = new Date(email.date);
                        const emailDateOnly = new Date(emailDate.getFullYear(), emailDate.getMonth(), emailDate.getDate());

                        if (emailDateOnly.getTime() === today.getTime()) {
                            todayEmails.push(email);
                        } else if (emailDateOnly.getTime() === yesterday.getTime()) {
                            yesterdayEmails.push(email);
                        } else if (emailDateOnly.getTime() === beforeYesterday.getTime()) {
                            beforeYesterdayEmails.push(email);
                        } else {
                            olderEmails.push(email);
                        }
                    });

                    // Sort each category by date descending
                    const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
                    todayEmails.sort(sortByDate);
                    yesterdayEmails.sort(sortByDate);
                    beforeYesterdayEmails.sort(sortByDate);
                    olderEmails.sort(sortByDate);

                    return res.json({
                        success: true,
                        today: todayEmails,
                        yesterday: yesterdayEmails,
                        beforeYesterday: beforeYesterdayEmails,
                        older: olderEmails,
                        stats: {
                            total: emails.length,
                            today: todayEmails.length,
                            yesterday: yesterdayEmails.length,
                            beforeYesterday: beforeYesterdayEmails.length,
                            older: olderEmails.length
                        }
                    });
                });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Fetch single email content
app.post('/api/email', requireAuth, (req, res) => {
    const { folder = 'INBOX', uid } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox(folder, false, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open folder: ' + err.message });
            }

            const fetch = imap.fetch(uid, { bodies: '', markSeen: true });

            fetch.on('message', (msg) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, (err, parsed) => {
                        imap.end();

                        if (responseSent) return;
                        responseSent = true;

                        if (err) {
                            console.error('Parse error:', err);
                            return res.status(500).json({ success: false, message: 'Failed to parse email' });
                        }

                        const emailData = {
                            from: parsed.from ? parsed.from.text : '',
                            to: parsed.to ? parsed.to.text : '',
                            cc: parsed.cc ? parsed.cc.text : '',
                            subject: parsed.subject || '(Sans objet)',
                            date: parsed.date ? parsed.date.toISOString() : '',
                            text: parsed.text || '',
                            html: parsed.html || '',
                            attachments: (parsed.attachments || []).map((att, index) => ({
                                filename: att.filename,
                                contentType: att.contentType,
                                size: att.size,
                                attachmentId: `${uid}_${index}` // Unique ID for download
                            }))
                        };

                        // Store attachments temporarily? 
                        // Note: On Vercel, /tmp is not persistent between requests.
                        // We will bypass session storage for attachments to keep cookie size small.
                        return res.json({ success: true, email: emailData });
                    });
                });
            });

            fetch.once('error', (err) => {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Fetch error: ' + err.message });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

app.get('/api/download-attachment/:attachmentId', requireAuth, (req, res) => {
    // Note: Attachment downloads via stateful /tmp will not work reliably on Vercel.
    return res.status(501).json({ success: false, message: 'Downloads are currently not supported in the web-hosted version. Use the desktop app for full features.' });
});

// Delete emails
app.post('/api/delete-emails', requireAuth, (req, res) => {
    const { folder = 'INBOX', uids } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!uids || uids.length === 0) {
        return res.status(400).json({ success: false, message: 'No emails selected' });
    }

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox(folder, false, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open folder: ' + err.message });
            }

            // Add Deleted flag
            imap.addFlags(uids, ['\\Deleted'], (err) => {
                if (err) {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;
                    return res.status(500).json({ success: false, message: 'Failed to delete: ' + err.message });
                }

                // Expunge to permanently remove
                imap.expunge((err) => {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;

                    if (err) {
                        return res.status(500).json({ success: false, message: 'Failed to expunge: ' + err.message });
                    }
                    return res.json({ success: true, message: 'Emails deleted successfully' });
                });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Send email via SMTP with attachments and save to Sent folder
app.post('/api/send-email', requireAuth, upload.array('attachments', 10), async (req, res) => {
    const { to, cc, bcc, subject, body } = req.body;
    const userEmail = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);
    const attachments = req.files || [];

    if (!to) {
        // Clean up uploaded files if validation fails
        attachments.forEach(file => {
            try { fs.unlinkSync(file.path); } catch (e) { }
        });
        return res.status(400).json({ success: false, message: 'Recipient is required' });
    }

    try {
        // Create SMTP transporter
        const transporter = nodemailer.createTransport({
            host: 'mail.labo-nedjma.com',
            port: 465,
            secure: true,
            auth: {
                user: userEmail,
                pass: password
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Prepare email options with attachments
        const mailOptions = {
            from: userEmail,
            to: to,
            subject: subject || '(Sans objet)',
            text: body || '',
            attachments: attachments.map(file => ({
                filename: file.originalname,
                path: file.path,
                contentType: file.mimetype
            }))
        };

        // Add CC if provided
        if (cc) {
            mailOptions.cc = cc;
        }

        // Add BCC if provided
        if (bcc) {
            mailOptions.bcc = bcc;
        }

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);

        // Save to Sent folder using IMAP with MIME format for attachments
        const imapConfig = getImapConfig(userEmail, password);
        const imap = new Imap(imapConfig);

        imap.once('ready', () => {
            imap.openBox('INBOX.Sent', false, (err, box) => {
                if (err) {
                    console.error('Failed to open Sent folder:', err);
                    imap.end();
                    // Clean up uploaded files
                    attachments.forEach(file => {
                        try { fs.unlinkSync(file.path); } catch (e) { }
                    });
                    return res.json({ success: true, message: 'Email sent but failed to save to Sent folder' });
                }

                // Build MIME message with attachments
                const boundary = '----=_Part_' + Date.now().toString(36);
                let mimeMessage = '';

                // Headers
                mimeMessage += `From: ${userEmail}\r\n`;
                mimeMessage += `To: ${to}\r\n`;
                if (cc) mimeMessage += `Cc: ${cc}\r\n`;
                if (bcc) mimeMessage += `Bcc: ${bcc}\r\n`;
                mimeMessage += `Subject: ${subject || '(Sans objet)'}\r\n`;
                mimeMessage += `Date: ${new Date().toUTCString()}\r\n`;
                mimeMessage += `MIME-Version: 1.0\r\n`;

                if (attachments.length > 0) {
                    mimeMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

                    // Text body part
                    mimeMessage += `--${boundary}\r\n`;
                    mimeMessage += `Content-Type: text/plain; charset="utf-8"\r\n`;
                    mimeMessage += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
                    mimeMessage += `${body || ''}\r\n\r\n`;

                    // Attachment parts
                    attachments.forEach(file => {
                        const fileContent = fs.readFileSync(file.path);
                        const base64Content = fileContent.toString('base64');

                        mimeMessage += `--${boundary}\r\n`;
                        mimeMessage += `Content-Type: ${file.mimetype}; name="${file.originalname}"\r\n`;
                        mimeMessage += `Content-Disposition: attachment; filename="${file.originalname}"\r\n`;
                        mimeMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;

                        // Split base64 content into 76-character lines
                        for (let i = 0; i < base64Content.length; i += 76) {
                            mimeMessage += base64Content.slice(i, i + 76) + '\r\n';
                        }
                        mimeMessage += '\r\n';
                    });

                    mimeMessage += `--${boundary}--\r\n`;
                } else {
                    mimeMessage += `Content-Type: text/plain; charset="utf-8"\r\n\r\n`;
                    mimeMessage += `${body || ''}\r\n`;
                }

                imap.append(mimeMessage, { mailbox: 'INBOX.Sent', flags: ['\\Seen'] }, (err) => {
                    imap.end();

                    // Clean up uploaded files after saving
                    attachments.forEach(file => {
                        try { fs.unlinkSync(file.path); } catch (e) { }
                    });

                    if (err) {
                        console.error('Failed to save to Sent:', err);
                        return res.json({
                            success: true,
                            message: 'Email sent but failed to save to Sent folder',
                            attachmentCount: attachments.length
                        });
                    }
                    return res.json({
                        success: true,
                        message: attachments.length > 0
                            ? `Email sent with ${attachments.length} attachment(s)`
                            : 'Email sent successfully',
                        attachmentCount: attachments.length
                    });
                });
            });
        });

        imap.once('error', (err) => {
            console.error('IMAP error when saving to Sent:', err);
            // Clean up uploaded files
            attachments.forEach(file => {
                try { fs.unlinkSync(file.path); } catch (e) { }
            });
            return res.json({ success: true, message: 'Email sent but failed to connect to Sent folder' });
        });

        imap.connect();

    } catch (err) {
        console.error('SMTP error:', err);
        // Clean up uploaded files on error
        attachments.forEach(file => {
            try { fs.unlinkSync(file.path); } catch (e) { }
        });
        return res.status(500).json({ success: false, message: 'Failed to send email: ' + err.message });
    }
});

// Save draft
app.post('/api/save-draft', requireAuth, (req, res) => {
    const { to, cc, bcc, subject, body } = req.body;
    const userEmail = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!to && !subject && !body) {
        return res.status(400).json({ success: false, message: 'Draft is empty' });
    }

    const imapConfig = getImapConfig(userEmail, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox('INBOX.Drafts', false, (err, box) => {
            if (err) {
                console.error('Failed to open Drafts folder:', err);
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to access Drafts folder' });
            }

            // Construct the draft email message with CC/BCC
            const messageLines = [
                `From: ${userEmail}`,
                `To: ${to || ''}`
            ];

            if (cc) {
                messageLines.push(`Cc: ${cc}`);
            }

            if (bcc) {
                messageLines.push(`Bcc: ${bcc}`);
            }

            messageLines.push(
                `Subject: ${subject || '(Sans objet)'}`,
                `Date: ${new Date().toUTCString()}`,
                `X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0; attachments=0`,
                '',
                body || ''
            );

            const message = messageLines.join('\r\n');

            imap.append(message, { mailbox: 'INBOX.Drafts', flags: ['\\Draft', '\\Seen'] }, (err) => {
                imap.end();
                if (responseSent) return;
                responseSent = true;

                if (err) {
                    console.error('Failed to save draft:', err);
                    return res.status(500).json({ success: false, message: 'Failed to save draft' });
                }
                return res.json({ success: true, message: 'Draft saved successfully' });
            });
        });
    });

    imap.once('error', (err) => {
        console.error('IMAP error when saving draft:', err);
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP connection error' });
    });

    imap.connect();
});

// Create folder
app.post('/api/create-folder', requireAuth, (req, res) => {
    const { folderName } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!folderName) {
        return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.addBox(folderName, (err) => {
            imap.end();
            if (responseSent) return;
            responseSent = true;

            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to create folder: ' + err.message });
            }
            return res.json({ success: true, message: 'Folder created successfully' });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Delete folder
app.post('/api/delete-folder', requireAuth, (req, res) => {
    const { folderName } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!folderName) {
        return res.status(400).json({ success: false, message: 'Folder name is required' });
    }

    // Prevent deleting system folders
    const systemFolders = ['INBOX', 'INBOX.Sent', 'INBOX.Drafts', 'INBOX.Trash', 'INBOX.Junk'];
    if (systemFolders.includes(folderName)) {
        return res.status(400).json({ success: false, message: 'Cannot delete system folders' });
    }

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.delBox(folderName, (err) => {
            imap.end();
            if (responseSent) return;
            responseSent = true;

            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to delete folder: ' + err.message });
            }
            return res.json({ success: true, message: 'Folder deleted successfully' });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Move email to another folder
app.post('/api/move-email', requireAuth, (req, res) => {
    const { sourceFolder = 'INBOX', targetFolder, uids } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!targetFolder || !uids || uids.length === 0) {
        return res.status(400).json({ success: false, message: 'Target folder and UIDs are required' });
    }

    const imapConfig = getImapConfig(email, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox(sourceFolder, false, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open source folder: ' + err.message });
            }

            imap.move(uids, targetFolder, (err) => {
                imap.end();
                if (responseSent) return;
                responseSent = true;

                if (err) {
                    return res.status(500).json({ success: false, message: 'Failed to move emails: ' + err.message });
                }
                return res.json({ success: true, message: 'Emails moved successfully' });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// Classic search endpoint
// Classic search endpoint
app.post('/api/classic-search', requireAuth, (req, res) => {
    const { folder, sender, keywords, dateFrom, dateTo } = req.body;
    const userEmail = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    const imapConfig = getImapConfig(userEmail, password);
    const imap = new Imap(imapConfig);
    let responseSent = false;

    imap.once('ready', () => {
        imap.openBox(folder || 'INBOX', true, (err, box) => {
            if (err) {
                imap.end();
                if (responseSent) return;
                responseSent = true;
                return res.status(500).json({ success: false, message: 'Failed to open folder: ' + err.message });
            }

            // Build search criteria
            // node-imap search criteria: https://github.com/mscdex/node-imap#useful-search-criteria
            let searchCriteria = ['ALL'];

            if (sender) {
                searchCriteria.push(['FROM', sender]);
            }

            if (keywords) {
                // Search in subject OR body
                searchCriteria.push(['OR', ['SUBJECT', keywords], ['BODY', keywords]]);
            }

            if (dateFrom) {
                searchCriteria.push(['SINCE', new Date(dateFrom)]);
            }

            if (dateTo) {
                const toDate = new Date(dateTo);
                // IMAP BEFORE is exclusive, so add one day to include dateTo
                toDate.setDate(toDate.getDate() + 1);
                searchCriteria.push(['BEFORE', toDate]);
            }

            // If no filters, default to ALL or just return recent
            const finalCriteria = searchCriteria.length > 1 ? searchCriteria.slice(1) : 'ALL';

            imap.search(finalCriteria, (err, uids) => {
                if (err) {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;
                    return res.status(500).json({ success: false, message: 'Search error: ' + err.message });
                }

                if (!uids || uids.length === 0) {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;
                    return res.json({ success: true, emails: [] });
                }

                // Limit results to 50 newest
                const uidsToFetch = uids.sort((a, b) => b - a).slice(0, 50);
                const emails = [];

                const fetch = imap.fetch(uidsToFetch, {
                    bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
                    struct: true
                });

                fetch.on('message', (msg, seqno) => {
                    let emailData = { folder: folder || 'INBOX' };

                    msg.on('attributes', (attrs) => {
                        emailData.uid = attrs.uid;
                        emailData.seen = attrs.flags.includes('\\Seen');
                        emailData.flagged = attrs.flags.includes('\\Flagged');
                    });

                    msg.on('body', (stream, info) => {
                        let buffer = '';
                        stream.on('data', (chunk) => buffer += chunk.toString('utf8'));
                        stream.once('end', () => {
                            const parsed = Imap.parseHeader(buffer);
                            emailData.from = parsed.from ? parsed.from[0] : '';
                            emailData.subject = parsed.subject ? parsed.subject[0] : '';
                            emailData.date = parsed.date ? parsed.date[0] : '';
                            emailData.to = parsed.to ? parsed.to[0] : '';
                        });
                    });

                    msg.once('end', () => {
                        // Extract sender name from "Name <email>" format
                        if (emailData.from) {
                            const match = emailData.from.match(/^"?([^"<]+)"?\s*<?/);
                            if (match) {
                                emailData.fromName = match[1].trim();
                            }
                        }
                        emailData.preview = ''; // Previews aren't fetched here to keep it fast
                        emails.push(emailData);
                    });
                });

                fetch.once('error', (err) => {
                    console.error('Fetch error:', err);
                });

                fetch.once('end', () => {
                    imap.end();
                    if (responseSent) return;
                    responseSent = true;

                    // Final sort by date descending
                    emails.sort((a, b) => new Date(b.date) - new Date(a.date));

                    return res.json({ success: true, emails });
                });
            });
        });
    });

    imap.once('error', (err) => {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'IMAP error: ' + err.message });
    });

    try {
        imap.connect();
    } catch (err) {
        if (responseSent) return;
        responseSent = true;
        return res.status(500).json({ success: false, message: 'Connection error: ' + err.message });
    }
});

// AI Search endpoint
app.post('/api/ai-search', requireAuth, async (req, res) => {
    const { query, apiKey, model = 'openai/gpt-3.5-turbo' } = req.body;
    const email = req.session.email;
    const password = decrypt(req.session.password, req.session.sessionKey);

    if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    if (!apiKey) {
        return res.status(400).json({ success: false, message: 'OpenRouter API key is required' });
    }

    try {
        // First, fetch all emails from INBOX
        const imapConfig = getImapConfig(email, password);
        const imap = new Imap(imapConfig);
        const allEmails = [];

        await new Promise((resolve, reject) => {
            let responseSent = false;

            imap.once('ready', () => {
                imap.openBox('INBOX', true, (err, box) => {
                    if (err) {
                        imap.end();
                        if (!responseSent) {
                            responseSent = true;
                            reject(err);
                        }
                        return;
                    }

                    if (box.messages.total === 0) {
                        imap.end();
                        if (!responseSent) {
                            responseSent = true;
                            resolve([]);
                        }
                        return;
                    }

                    // Fetch last 100 emails for search
                    const start = Math.max(1, box.messages.total - 99);
                    const end = box.messages.total;

                    const fetch = imap.seq.fetch(`${start}:${end}`, {
                        bodies: '',
                        struct: true
                    });

                    fetch.on('message', (msg, seqno) => {
                        msg.on('body', (stream) => {
                            simpleParser(stream, (err, parsed) => {
                                if (!err && parsed) {
                                    allEmails.push({
                                        subject: parsed.subject || '(Sans objet)',
                                        from: parsed.from ? parsed.from.text : '',
                                        date: parsed.date ? parsed.date.toISOString() : '',
                                        text: parsed.text ? parsed.text.substring(0, 500) : '' // Limit text for AI
                                    });
                                }
                            });
                        });
                    });

                    fetch.once('end', () => {
                        imap.end();
                        if (!responseSent) {
                            responseSent = true;
                            resolve(allEmails);
                        }
                    });

                    fetch.once('error', (err) => {
                        imap.end();
                        if (!responseSent) {
                            responseSent = true;
                            reject(err);
                        }
                    });
                });
            });

            imap.once('error', (err) => {
                if (!responseSent) {
                    responseSent = true;
                    reject(err);
                }
            });

            imap.connect();
        });

        // Now use AI to search through emails
        const emailsContext = allEmails.map((e, i) =>
            `Email ${i + 1}:\nDe: ${e.from}\nObjet: ${e.subject}\nDate: ${e.date}\nContenu: ${e.text}\n---`
        ).join('\n');

        const aiPrompt = `Tu es un assistant de recherche d'emails. 
Voici une liste d'emails:

${emailsContext}

Question de l'utilisateur: ${query}

Réponds en JSON avec cette structure:
{
  "relevant_emails": [numéros des emails pertinents],
  "summary": "résumé de ce qui a été trouvé",
  "answer": "réponse à la question"
}`;

        // Call OpenRouter API
        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'Outlook AI'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: 'user',
                        content: aiPrompt
                    }
                ],
                temperature: 0.3
            })
        });

        if (!aiResponse.ok) {
            throw new Error('OpenRouter API error: ' + aiResponse.statusText);
        }

        const aiData = await aiResponse.json();
        const aiResult = aiData.choices[0].message.content;

        // Try to parse JSON response
        let parsedResult;
        try {
            parsedResult = JSON.parse(aiResult);
        } catch (e) {
            // If not valid JSON, return raw response
            parsedResult = {
                relevant_emails: [],
                summary: aiResult,
                answer: aiResult
            };
        }

        // Get the relevant emails
        const relevantEmails = parsedResult.relevant_emails || [];
        const results = relevantEmails.map(index => allEmails[index - 1]).filter(Boolean);

        return res.json({
            success: true,
            results: results,
            summary: parsedResult.summary,
            answer: parsedResult.answer,
            totalEmailsSearched: allEmails.length
        });

    } catch (err) {
        console.error('AI Search error:', err);
        return res.status(500).json({ success: false, message: 'AI search failed: ' + err.message });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to logout' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Handle uncaught errors to prevent server crash
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

try {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
        try {
            fs.unlinkSync(path.join(tempDir, file));
        } catch (err) {
            console.error('Error deleting temp file:', err);
        }
    });
} catch (err) {
    console.error('Error cleaning temp directory:', err);
}

// ============================================
// OpenRouter AI API Check
// ============================================

// Store AI settings in memory (in production, use a database)
let aiSettings = {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: 'openai/gpt-3.5-turbo'
};

// Check AI API connection
app.post('/api/check-ai', requireAuth, async (req, res) => {
    try {
        // Get API key from settings or request
        const apiKey = req.body.apiKey || aiSettings.apiKey;

        if (!apiKey) {
            return res.json({
                success: false,
                message: 'Clé API OpenRouter non configurée',
                configured: false
            });
        }

        // Test OpenRouter API connection with a simple request
        const testResponse = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (testResponse.ok) {
            const models = await testResponse.json();
            return res.json({
                success: true,
                message: 'OpenRouter AI connecté',
                configured: true,
                modelsAvailable: models.data ? models.data.length : 0
            });
        } else {
            const error = await testResponse.json();
            return res.json({
                success: false,
                message: error.error?.message || 'Erreur de connexion à OpenRouter',
                configured: true
            });
        }
    } catch (error) {
        console.error('AI API check error:', error);
        return res.json({
            success: false,
            message: 'Erreur de connexion au serveur AI: ' + error.message,
            configured: !!aiSettings.apiKey
        });
    }
});

// Save AI API Key and Model
app.post('/api/save-ai-key', requireAuth, (req, res) => {
    const { apiKey, model } = req.body;

    if (!apiKey) {
        return res.status(400).json({ success: false, message: 'Clé API requise' });
    }

    aiSettings.apiKey = apiKey;
    if (model) {
        aiSettings.model = model;
    }

    console.log('[AI Settings] API Key saved, Model:', aiSettings.model);
    return res.json({ success: true, message: 'Paramètres IA enregistrés' });
});

// Get AI settings
app.get('/api/ai-settings', requireAuth, (req, res) => {
    return res.json({
        success: true,
        configured: !!aiSettings.apiKey,
        model: aiSettings.model,
        // Don't send the full key for security
        apiKeyConfigured: aiSettings.apiKey ? `${aiSettings.apiKey.substring(0, 10)}...` : null
    });
});

if (!isVercel) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

app.get('/api/check-session', (req, res) => {
    if (req.session && req.session.email) {
        req.session.lastSeen = Date.now();
        return res.json({ success: true, email: req.session.email });
    }
    res.status(401).json({ success: false });
});

module.exports = app;
