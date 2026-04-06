const db = require('../db');
const { sendActivePlanEmail, sendExpingPlanEmail, sendExpiredPlanEmail } = require('../../helper/emails');
const axios = require('axios');

// Helper function to format date
function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper function to send WhatsApp message
async function sendWhatsAppMessage(phone, message) {
    try {
        await axios.post('http://localhost:5051/send', {
            phone: "91" + phone,
            message: message
        });
        //console.log(`   📱 WhatsApp message sent to ${phone}`);
    } catch (error) {
        console.error(`   Failed to send WhatsApp message:`, error);
    }
}

async function checkAndExpireJobs() {
    try {
        const [rows] = await db.execute(`
            SELECT * FROM users_plans 
            WHERE status IN ('active', 'inactive')
            ORDER BY userid, started_at
        `);

        let planNameMap = {
            'startup_monthly': 'Startup',
            'startup_quarterly': 'Startup',
            'starter_monthly': 'Starter',
            'starter_quarterly': 'Starter',
            'enterprise_monthly': 'Enterprise',
            'enterprise_quarterly': 'Enterprise',
            'business_monthly': 'Business',
            'business_quarterly': 'Business'
        };

        const userPlans = {};

        // Group plans by user
        for (const plan of rows) {
            if (!userPlans[plan.userid]) {
                userPlans[plan.userid] = [];
            }
            userPlans[plan.userid].push(plan);
        }

        const now = new Date();

        for (const userId in userPlans) {
            const plans = userPlans[userId];

            // Sort plans by started_at (proper sequence)
            plans.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

            //console.log(`\n=== Checking plans for user: ${userId} ===`);
            //console.log(`Total plans: ${plans.length}`);

            const [users] = await db.execute(
                'SELECT * FROM users WHERE userid = ?',
                [userId]
            );
            const user = users[0];
            if (!user) {
                //console.log(`⚠️  User not found for userid: ${userId}. Skipping...`);
                continue;
            }
            //console.log(`Name: ${user.name} Phone: ${user.phone} Email: ${user.email}`);

            // Find current active plan
            const activePlan = plans.find(p => p.status === 'active');

            // Find ALL inactive plans (excluding expired/suspended ones)
            const validInactivePlans = plans.filter(p =>
                p.status === 'inactive' &&
                p.plan_status === 'active'
            );

            // Check active plan for expiration
            if (activePlan) {
                const expire_at = new Date(activePlan.expire_at);
                const daysUntilExpiry = Math.ceil((expire_at - now) / (1000 * 60 * 60 * 24));
                const daysSinceExpired = Math.ceil((now - expire_at) / (1000 * 60 * 60 * 24));

                const planName = planNameMap[activePlan.plan_id] || activePlan.plan_id;
                //console.log(`\n📋 ACTIVE PLAN:`);
                //console.log(`   Plan ID: ${activePlan.id}, Plan: ${planName} (${activePlan.plan_id})`);
                //console.log(`   Started: ${activePlan.started_at}`);
                //console.log(`   Expires: ${activePlan.expire_at}`);
                //console.log(`   Days until expiry: ${daysUntilExpiry}`);

                if (expire_at < now) {
                    // Plan has expired
                    //console.log(`❌ ACTIVE PLAN EXPIRED!`);
                    //console.log(`   Expired ${daysSinceExpired} days ago`);

                    // Check if should be suspended (more than 3 days expired)
                    if (daysSinceExpired > 3) {
                        //console.log(`   → Should be marked as 'suspend' (expired > 3 days ago)`);
                        // Update plan status to 'suspend' in database
                        await db.execute(
                            'UPDATE users_plans SET status = ?, plan_status = ? WHERE id = ?',
                            ['suspend', 'expired', activePlan.id]
                        );
                    } else {
                        //console.log(`   → Should be marked as 'expired' (expired ${daysSinceExpired} days ago)`);
                        // Update plan status to 'expired' and status to 'inactive' in database
                        await db.execute(
                            'UPDATE users_plans SET plan_status = ?, status = ? WHERE id = ?',
                            ['expired', 'inactive', activePlan.id]
                        );

                        // Send expired plan email
                        try {
                            await sendExpiredPlanEmail(
                                user.email,
                                user.name,
                                planName,
                                formatDate(expire_at)
                            );
                            //console.log(`   📧 Expired plan email sent to ${user.email}`);

                            // Send WhatsApp message for expired plan
                            const expiredWhatsappMessage = `Dear ${user.name},

Your plan ${planName} has expired on ${formatDate(expire_at)}.

Your QR code generation and other premium features are now suspended.

Please renew your plan to continue using all features.
Renew now: https://upiexpress.com

Thank you for choosing UPI Express!`;

                            await sendWhatsAppMessage(user.phone, expiredWhatsappMessage);
                        } catch (error) {
                            console.error(`   Failed to send expired plan notifications:`, error);
                        }
                    }

                    // Check for next valid inactive plan to activate (NOT the expired one!)
                    // Find the first valid inactive plan that hasn't started yet or just started
                    const nextValidInactivePlan = validInactivePlans.find(p =>
                        new Date(p.started_at) > new Date(activePlan.started_at)
                    );

                    if (nextValidInactivePlan) {
                        const nextPlanName = planNameMap[nextValidInactivePlan.plan_id] || nextValidInactivePlan.plan_id;
                        //console.log(`\n🔄 NEXT VALID PLAN TO ACTIVATE:`);
                        //console.log(`   Plan ID: ${nextValidInactivePlan.id}, Plan: ${nextPlanName} (${nextValidInactivePlan.plan_id})`);
                        //console.log(`   Status: ${nextValidInactivePlan.status}`);
                        //console.log(`   Start Date: ${nextValidInactivePlan.started_at}`);

                        const nextPlanStart = new Date(nextValidInactivePlan.started_at);
                        if (nextPlanStart <= now) {
                            //console.log(`   ✅ Should become ACTIVE now!`);

                            // Activate the next valid plan
                            await db.execute(
                                'UPDATE users_plans SET status = ?, plan_status = ? WHERE id = ?',
                                ['active', 'active', nextValidInactivePlan.id]
                            );

                            // Calculate expiration date for the new plan
                            const expireDate = new Date(nextPlanStart);
                            expireDate.setDate(expireDate.getDate() + 30); // Assuming 30-day plans

                            // Send active plan email and WhatsApp
                            try {
                                await sendActivePlanEmail(
                                    user.email,
                                    user.name,
                                    nextPlanName,
                                    formatDate(nextPlanStart),
                                    formatDate(expireDate),
                                    nextValidInactivePlan.qr_code_requests_limit
                                );
                                //console.log(`   📧 Active plan email sent to ${user.email}`);

                                // Send WhatsApp message for active plan
                                const activeWhatsappMessage = `Dear ${user.name},

Your plan ${nextPlanName} has been successfully activated on UPI Express.

📅 Validity: ${formatDate(nextPlanStart)} to ${formatDate(expireDate)}
🔢 QR Request Limit: ${nextValidInactivePlan.qr_code_requests_limit}
⚡ Features Enabled: Based on your plan

Thank you for choosing UPI Express!
Login now: https://upiexpress.com`;

                                await sendWhatsAppMessage(user.phone, activeWhatsappMessage);
                            } catch (error) {
                                console.error(`   Failed to send active plan notifications:`, error);
                            }
                        } else {
                            //console.log(`   ⏳ Will become active on: ${nextPlanStart.toISOString()}`);
                        }
                    } else {
                        //console.log(`\n⚠️  No valid inactive plan found to activate after this one!`);
                    }
                } else {
                    // Plan is still active
                    //console.log(`✅ PLAN IS ACTIVE`);

                    // Check if expiring soon (within 3 days)
                    if (daysUntilExpiry <= 3 && daysUntilExpiry > 0) {
                        //console.log(`⚠️  PLAN EXPIRING SOON!`);
                        //console.log(`   Will expire in ${daysUntilExpiry} days`);

                        // Update plan status to 'expiring' in database
                        await db.execute(
                            'UPDATE users_plans SET plan_status = ? WHERE id = ?',
                            ['expiring', activePlan.id]
                        );
                        //console.log(`   → Status updated to 'expiring'`);

                        // Send expiring plan email
                        try {
                            await sendExpingPlanEmail(
                                user.email,
                                user.name,
                                planName,
                                formatDate(expire_at),
                                activePlan.qr_code_requests_limit
                            );
                            //console.log(`   📧 Expiring plan email sent to ${user.email}`);

                            // Send WhatsApp message for expiring plan
                            const expiringWhatsappMessage = `Dear ${user.name},

Your plan ${planName} is expiring soon!

📅 Expiry Date: ${formatDate(expire_at)}
⏰ Remaining Days: ${daysUntilExpiry} days
🔢 Remaining QR Requests: ${activePlan.qr_code_requests_limit}

Renew your plan now to avoid service interruption.
Renew now: https://upiexpress.com

Thank you for choosing UPI Express!`;

                            await sendWhatsAppMessage(user.phone, expiringWhatsappMessage);
                        } catch (error) {
                            console.error(`   Failed to send expiring plan notifications:`, error);
                        }
                    } else if (daysUntilExpiry > 3 && activePlan.plan_status === 'expiring') {
                        // If plan was marked as expiring but now has more than 3 days left, revert to active
                        //console.log(`🔙 Plan has more than 3 days left, reverting to 'active' status`);
                        await db.execute(
                            'UPDATE users_plans SET plan_status = ? WHERE id = ?',
                            ['active', activePlan.id]
                        );
                    }
                }
            } else {
                //console.log(`\n⚠️  No active plan found!`);

                // Check if there's a valid inactive plan that should be active
                // Find the first valid inactive plan (with plan_status = 'active')
                const nextValidInactivePlan = validInactivePlans[0];
                if (nextValidInactivePlan) {
                    const nextPlanStart = new Date(nextValidInactivePlan.started_at);

                    const nextPlanName = planNameMap[nextValidInactivePlan.plan_id] || nextValidInactivePlan.plan_id;
                    //console.log(`\n🔍 CHECKING VALID INACTIVE PLANS:`);
                    //console.log(`   Next valid plan: ID ${nextValidInactivePlan.id}, Plan: ${nextPlanName} (${nextValidInactivePlan.plan_id})`);
                    //console.log(`   Start Date: ${nextValidInactivePlan.started_at}`);

                    if (nextPlanStart <= now) {
                        //console.log(`   🚨 This plan should be ACTIVE!`);
                        //console.log(`      Start date has passed but status is still 'inactive'`);

                        // Activate the plan
                        await db.execute(
                            'UPDATE users_plans SET status = ?, plan_status = ? WHERE id = ?',
                            ['active', 'active', nextValidInactivePlan.id]
                        );

                        // Calculate expiration date
                        const expireDate = new Date(nextPlanStart);
                        expireDate.setDate(expireDate.getDate() + 30);

                        // Send activation notifications
                        try {
                            await sendActivePlanEmail(
                                user.email,
                                user.name,
                                nextPlanName,
                                formatDate(nextPlanStart),
                                formatDate(expireDate),
                                nextValidInactivePlan.qr_code_requests_limit
                            );
                            //console.log(`   📧 Active plan email sent to ${user.email}`);

                            const whatsappMessage = `Dear ${user.name},

Your plan ${nextPlanName} has been successfully activated on UPI Express.

📅 Validity: ${formatDate(nextPlanStart)} to ${formatDate(expireDate)}
🔢 QR Request Limit: ${nextValidInactivePlan.qr_code_requests_limit}
⚡ Features Enabled: Based on your plan

Thank you for choosing UPI Express!
Login now: https://upiexpress.com`;

                            await sendWhatsAppMessage(user.phone, whatsappMessage);
                        } catch (error) {
                            console.error(`   Failed to send activation notifications:`, error);
                        }
                    } else {
                        //console.log(`   ⏳ Plan will start on: ${nextPlanStart.toISOString()}`);
                    }
                } else {
                    //console.log(`   No valid inactive plans found (with plan_status='active')`);
                }
            }

            // Check all expired plans for suspension
            //console.log(`\n🔍 CHECKING ALL PLANS FOR SUSPENSION:`);
            for (const plan of plans) {
                const expire_at = new Date(plan.expire_at);
                const daysSinceExpired = Math.ceil((now - expire_at) / (1000 * 60 * 60 * 24));

                if (expire_at < now && daysSinceExpired > 3 && plan.status !== 'suspend') {
                    //console.log(`   Plan ID ${plan.id}: Expired ${daysSinceExpired} days ago`);
                    //console.log(`      → Should be marked as 'suspend'`);

                    // Update to suspend status
                    await db.execute(
                        'UPDATE users_plans SET status = ?, plan_status = ? WHERE id = ?',
                        ['suspend', 'expired', plan.id]
                    );
                } else if (expire_at < now && daysSinceExpired <= 3 && plan.plan_status === 'active') {
                    //console.log(`   Plan ID ${plan.id}: Expired ${daysSinceExpired} days ago`);
                    //console.log(`      → Currently 'expired', will be 'suspend' in ${3 - daysSinceExpired} days`);
                }
            }

            // // Show all plans summary
            // //console.log(`\n📊 ALL PLANS SUMMARY:`);
            // for (const plan of plans) {
            //     const expire_at = new Date(plan.expire_at);
            //     const daysUntilExpiry = Math.ceil((expire_at - now) / (1000 * 60 * 60 * 24));
            //     const daysSinceExpired = Math.ceil((now - expire_at) / (1000 * 60 * 60 * 24));

            //     let statusIcon = '⏸️';
            //     let statusText = `${plan.status}`;

            //     if (plan.status === 'active') {
            //         if (expire_at < now) {
            //             statusIcon = '❌';
            //             statusText = 'expired';
            //         } else if (plan.plan_status === 'expiring') {
            //             statusIcon = '⚠️';
            //             statusText = 'expiring';
            //         } else {
            //             statusIcon = '✅';
            //             statusText = 'active';
            //         }
            //     } else if (plan.status === 'inactive') {
            //         if (plan.plan_status === 'active') {
            //             statusIcon = '⏳';
            //             statusText = 'waiting';
            //         } else {
            //             statusIcon = '⏸️';
            //             statusText = 'inactive';
            //         }
            //     } else if (plan.status === 'suspend') {
            //         statusIcon = '🚫';
            //         statusText = 'suspended';
            //     }

            //     const summaryPlanName = planNameMap[plan.plan_id] || plan.plan_id;
            //     //console.log(`   ${statusIcon} ID ${plan.id}: ${summaryPlanName} (${plan.plan_id})`);
            //     //console.log(`      Status: ${plan.status}, Plan Status: ${plan.plan_status}`);
            //     //console.log(`      Started: ${plan.started_at}, Expires: ${plan.expire_at}`);

            //     if (expire_at < now) {
            //         //console.log(`      Expired ${daysSinceExpired} days ago`);
            //     } else {
            //         //console.log(`      Expires in ${daysUntilExpiry} days`);
            //     }
            // }
        }

    } catch (error) {
        console.error('Error checking and expiring jobs:', error);
    }
}

exports.checkAndExpireJobs = checkAndExpireJobs;