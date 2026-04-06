const express = require('express');
const router = express.Router();
const { getAllPlans, transformPlans } = require('../helper/functions');

router.get('/', (req, res) => {
    res.render('main/index');
});

router.get('/privacy', (req, res) => {
    res.render('main/privacy');
});

router.get('/terms', (req, res) => {
    res.render('main/terms');
});

router.get('/faq', (req, res) => {
    res.render('main/faq');
});

router.get('/refund', (req, res) => {
    res.render('main/refund');
});

router.get('/pricing', async (req, res) => {
    res.render('main/pricing',
        {
            plans: transformPlans(await getAllPlans())
        }
    );
});

router.get('/doc', (req, res) => {
    res.render('main/doc');
});

router.get('/usecases', (req, res) => {
    res.render('main/usecases');
});

router.get('/features', (req, res) => {
    res.render('main/features');
});

router.get("/about-us", (req, res) => {
    res.render("main/about-us");
});

router.get('/contact-us', (req, res) => {
    res.render('main/contact-us');
});

router.get('/help', (req, res) => {
    res.render('main/help');
});

router.get('/blog', (req, res) => {
    res.render('main/blog');
});

router.get('/account_access_policey', (req, res) => {
    res.render('main/aa_policey');
});


module.exports = router;