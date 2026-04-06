function getUserToken(req) {
    return req.cookies.userToken || null;
}

module.exports = { getUserToken };