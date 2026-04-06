// db.js
const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'localhost',
    user: 'upiexpress',
    password: 'upiexpress',
    database: 'upiexpress'
});

module.exports = db;
