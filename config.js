const jwt = require("jsonwebtoken");
const {ApiKeyModel} = require("./models/api_keys");

function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(" ")[1]
    if (token == null) return res.sendStatus(401)

    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({message: "Invalid token"})
        req.user = user
        next()
    })
}

async function apiKeyMiddleware(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(" ")[1]
    if (token == null) return res.sendStatus(401)


    const link = await ApiKeyModel.findOne({apiKey: token}).populate('owner').catch(err => {
        return res.status(403).json({message: "Invalid key"})
    })
    req.methods = link.owner.methods
    req.key = token
    next()
}

exports.authMiddleware = authMiddleware
exports.apiKeyMiddleware = apiKeyMiddleware
