module.exports = {
    apps: [
        {
            name: "UPIExpres Server",
            script: "server.js",
            watch: true,
            ignore_watch: [
                "controllers/merchant/cookies",
                "controllers/merchant/sessions",
                "node_modules"
            ]
        }
    ]
}
