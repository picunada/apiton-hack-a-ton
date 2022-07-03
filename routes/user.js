require('dotenv').config()

const express = require('express');
const router = express.Router();
const {UserModel} = require('../models/user')
const TonWeb = require("tonweb");
const tonMnemonic = require("tonweb-mnemonic");
const jwt = require('jsonwebtoken')
const {authMiddleware} = require('../config')
const bcrypt = require("bcrypt")


router.get('/', async (req, res) => {
    try {
        const users = UserModel.find();
        res.json(users);
    } catch (e) {
        res.json({message: e});
    }
});


router.post('/', async (req, res) => {
    await UserModel.findOne({email: req.body.email}).then((result, err) => {
        if (err) return res.json({message: err})
        if (result) return res.status(403).json({message: "User with this email already exists."})
    })

    const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = '70e7d22cb30b309aa60833a27710e052b1fccf82f5b8c68c4902915f8c7f7daa';
    const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, {apiKey})); // Initialize TON SDK

    const seed = tonweb.utils.newSeed();
    const keyPair = tonweb.utils.keyPairFromSeed(seed)
    const wallet = tonweb.wallet.create({
        publicKey: keyPair.publicKey
    });
    const walletAddress = (await wallet.getAddress()).toString(true, true, true);
    const user = new UserModel({
        email: req.body.email,
        name: req.body.name,
        walletAddress: walletAddress,
        seed: seed,
        methods: []
    })

    try {
        await user.save()
        const savedUser = user.toObject()
        savedUser.secretKey = undefined
        res.json(savedUser)
    } catch (e) {
        return res.json({message: e});
    }

    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(req.body.password, salt, function (err, hash) {
            user.password = hash
            user.save(function (err) {
                if (err) return res.json({message: err}); // saved!
            })
        });
    })
})

router.post('/login', async (req, res) => {
    // User auth
    const user = {
        email: req.body.email
    }
    try {
        const db_user = await UserModel.findOne({email: req.body.email})
        bcrypt.compare(req.body.password, db_user.password, function (err, result) {
            if (result) {
                const accessToken = jwt.sign(user, process.env.SECRET_KEY)
                res.json({accessToken: accessToken})
            } else {
                res.status(403).json({message: "Bad credentials"})
            }
        });
    } catch (e) {
        res.json({message: e.message})
    }

})

router.get('/me', authMiddleware, async (req, res) => {
    const user = await UserModel.findOne(req.user).select('email name walletAddress methods')
    res.json(user)
})

router.post('/add_method', authMiddleware, async (req, res) => {
    const user = await UserModel.findOne(req.user).select('email name walletAddress methods')
    user.methods.push(req.body)
    user.save().then((result, err) => {
        if (err) {
            res.json({message: err.message})
        }
        res.json(result)
    })

})


module.exports = router
