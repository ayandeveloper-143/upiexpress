const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');
const path = require('path');

// Create transporter 
const transporter = nodemailer.createTransport({
    host: 'mail.srv1070916.hstgr.cloud',
    port: 587, // or 465 for SSL, 25 for non-SSL
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'no-reply@upiexpress.com',
        pass: 'Ayan1234'
    },
    tls: {
        rejectUnauthorized: false // For self-signed certificates
    }
});

// Verify transporter configuration
transporter.verify((error, success) => {
    // if (error) {
    //     console.log('Email transporter error:', error);
    // } else {
    //     console.log('Email server is ready to send messages');
    // }
});

async function sendForgetPasswordEmail(email, resetLink) {
    const templatePath = path.join(__dirname, '../emails/password-reset.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        resetLink: resetLink
    });

    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'Reset Your Password - UPIExpress',
        html: htmlContent,
        text: `Click the link below to reset your password: ${resetLink}\n\nThis link will expire in 15 minutes.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Password reset email sent successfully'
    };

}

async function sendOTPEmail(email, otpCode) {
    try {
        const templatePath = path.join(__dirname, '../emails/otp.ejs');
        const template = fs.readFileSync(templatePath, 'utf8');

        const htmlContent = ejs.render(template, {
            otpCode: otpCode
        });

        const mailOptions = {
            from: 'UPIExpress <no-reply@upiexpress.com>',
            to: email,
            subject: 'Your OTP Code - UPIExpress',
            html: htmlContent,
            text: `Your UPIExpress OTP code is: ${otpCode}. This code will expire in 15 minutes.`
        };


        const result = await transporter.sendMail(mailOptions);

        return {
            success: true,
            messageId: result.messageId,
            message: 'OTP sent successfully'
        };
    } catch (error) {
        console.error('Error sending OTP email:', error);
        return {
            success: false,
            message: 'Failed to send OTP email'
        };
    }

}

async function sendWelcomeEmail(email, userName) {
    const templatePath = path.join(__dirname, '../emails/welcome.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        userName: userName,
        createdAt: new Date().toLocaleDateString()
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'Welcome to UPIExpress!',
        html: htmlContent,
        text: `Hello ${userName}, welcome to UPIExpress! We're glad to have you on board.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Welcome email sent successfully'
    };
}

async function sendActivePlanEmail(email, UserName, PlanName, StartDate, EndDate, QRLimit) {
    const templatePath = path.join(__dirname, '../emails/active.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        UserName: UserName,
        PlanName: PlanName,
        StartDate: StartDate,
        EndDate: EndDate,
        QRLimit: QRLimit
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'Your Plan is Now Active - UPIExpress',
        html: htmlContent,
        text: `Hello ${UserName}, your plan ${PlanName} is now active from ${StartDate} to ${EndDate}. You have a QR request limit of ${QRLimit}.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Active plan email sent successfully'
    };
}

async function sendExpingPlanEmail(email, UserName, PlanName, EndDate, RemainingQR) {
    const templatePath = path.join(__dirname, '../emails/expiring.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        UserName: UserName,
        PlanName: PlanName,
        EndDate: EndDate,
        RemainingQR: RemainingQR
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'Your Plan is Expiring Soon - UPIExpress',
        html: htmlContent,
        text: `Hello ${UserName}, your plan ${PlanName} is expiring on ${EndDate}. Please renew to continue enjoying our services.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Expiring plan email sent successfully'
    };
}


async function sendExpiredPlanEmail(email, UserName, PlanName, EndDate) {
    const templatePath = path.join(__dirname, '../emails/expired.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        UserName: UserName,
        PlanName: PlanName,
        EndDate: EndDate
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'Your Plan has Expired - UPIExpress',
        html: htmlContent,
        text: `Hello ${UserName}, your plan ${PlanName} has expired on ${EndDate}. Please renew to regain access to our services.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Expired plan email sent successfully'
    };
}

async function sendLimitReachedEmail(email, UserName, PlanName, QRLimit) {
    const templatePath = path.join(__dirname, '../emails/limit-reached.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        UserName: UserName,
        PlanName: PlanName,
        QRLimit: QRLimit
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'QR Request Limit Reached - UPIExpress',
        html: htmlContent,
        text: `Hello ${UserName}, you have reached your QR request limit of ${QRLimit} for the plan ${PlanName}. Please upgrade your plan to continue using our services.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Limit reached email sent successfully'
    };
}

async function loginNotificationEmail(email, UserName, LoginTime, LoginIP) {
    const templatePath = path.join(__dirname, '../emails/login.ejs');
    const template = fs.readFileSync(templatePath, 'utf8');

    const htmlContent = ejs.render(template, {
        UserName: UserName,
        LoginTime: LoginTime,
        LoginIP: LoginIP
    });
    const mailOptions = {
        from: 'UPIExpress <no-reply@upiexpress.com>',
        to: email,
        subject: 'New Login Notification - UPIExpress',
        html: htmlContent,
        text: `Hello ${UserName}, we noticed a new login to your account on ${LoginTime} from IP address ${LoginIP}. If this was you, no further action is needed. If you did not log in, please secure your account immediately.`
    };

    const result = await transporter.sendMail(mailOptions);

    return {
        success: true,
        messageId: result.messageId,
        message: 'Login notification email sent successfully'
    };
}


module.exports = {
    sendForgetPasswordEmail,
    sendOTPEmail,
    sendWelcomeEmail,
    sendActivePlanEmail,
    sendExpingPlanEmail,
    sendExpiredPlanEmail,
    sendLimitReachedEmail,
    loginNotificationEmail
};

