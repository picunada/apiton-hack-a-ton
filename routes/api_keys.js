const express = require('express');
const {CustomerModel, UserModel} = require("../models/user");
const TonWeb = require("tonweb");
const {ApiKeyModel, ChannelModel, BalanceModel} = require("../models/api_keys");
const {apiKeyMiddleware, authMiddleware} = require("../config");
const {setTimeout} = require("timers/promises");
const {saveBalance, toNumberString} = require("../utils");
const toNano = TonWeb.utils.toNano;
const BN = TonWeb.utils.BN;
const router = express.Router();
const request = require("request");

const providerUrl = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const apiKey = '70e7d22cb30b309aa60833a27710e052b1fccf82f5b8c68c4902915f8c7f7daa';
const tonweb = new TonWeb(new TonWeb.HttpProvider(providerUrl, {apiKey})); // Initialize TON SDK
const fetch = require('node-fetch');
const https = require("https");

function string_to_uint8array(string) {
    return new Uint8Array(string.split(",").map(Number))
}

router.post("/link_new_customer", authMiddleware, async (req, res) => {

    const seed = tonweb.utils.newSeed();
    const keyPair = tonweb.utils.keyPairFromSeed(seed)
    const wallet = tonweb.wallet.create({
        publicKey: keyPair.publicKey
    });
    const walletAddress = (await wallet.getAddress()).toString(true, true, true);

    const customer = new CustomerModel({
        name: req.body.name,
        walletAddress: walletAddress,
        seed: seed
    })

    customer.save()

    const user = await UserModel.findOne(req.user).select('email name walletAddress methods')

    const new_customer = customer.toObject()
    new_customer.secretKey = undefined

    const apiLink = new ApiKeyModel({
        apiKey: walletAddress,
        owner: user,
        customer: new_customer,
        channel: undefined,
        costPerCall: req.query.costPerCall
    })

    apiLink.save()

    res.json({
        customer: new_customer,
        link: await apiLink.populate('owner customer', 'email name walletAddress')
    })
})

router.post('/create_channel', authMiddleware, async (req, res) => {
    console.log(req.user)
    const owner = await UserModel.findOne({email: req.user.email}).select('walletAddress seed')
    const customer = await CustomerModel.findOne({walletAddress: req.body.customer_wallet_address})
        .select('walletAddress seed')

    const ownerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(owner.seed))
    const customerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(customer.seed))

    const ownerWallet = tonweb.wallet.create({
        publicKey: ownerKeyPair.publicKey
    });

    const customerWallet = tonweb.wallet.create({
        publicKey: customerKeyPair.publicKey
    });

    const channelInitState = {
        balanceA: toNano('0'), // A's initial balance in Toncoins. Next A will need to make a top-up for this amount
        balanceB: toNano('2'), // B's initial balance in Toncoins. Next B will need to make a top-up for this amount
        seqnoA: new BN(0), // initially 0
        seqnoB: new BN(0)  // initially 0
    };

    const channelConfig = {
        channelId: new BN(193), // Channel ID, for each new channel there must be a new ID
        addressA: await ownerWallet.getAddress(), // A's funds will be withdrawn to this wallet address after the channel is closed
        addressB: await customerWallet.getAddress(), // B's funds will be withdrawn to this wallet address after the channel is closed
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }

    const channelA = tonweb.payments.createChannel({
        ...channelConfig,
        isA: true,
        myKeyPair: ownerKeyPair,
        hisPublicKey: customerKeyPair.publicKey,
    });


    const channelB = tonweb.payments.createChannel({
        ...channelConfig,
        isA: false,
        myKeyPair: customerKeyPair,
        hisPublicKey: ownerKeyPair.publicKey,
    });


    const fromWalletA = channelA.fromWallet({
        wallet: ownerWallet,
        secretKey: ownerKeyPair.secretKey
    });

    const fromWalletB = channelB.fromWallet({
        wallet: customerWallet,
        secretKey: customerKeyPair.secretKey
    });

    const channelAddress = await channelA.getAddress()
    console.log('channelAddress=', channelAddress.toString(true, true, true));


    if ((await channelB.getAddress()).toString() !== channelAddress.toString()) {
        throw new Error('Channels address not same');
    }

    await fromWalletA.deploy().send(toNano('0.05')).then(async (result) => {
        await setTimeout(10000)
        const data = await channelA.getData();
        console.log('balanceA = ', data.balanceA.toString())
        console.log('balanceB = ', data.balanceB.toString())
        await fromWalletA
            .topUp({coinsA: channelInitState.balanceA, coinsB: new BN(0)})
            .send(channelInitState.balanceA.add(toNano('0.05'))); // +0.05 TON to network fees

        await fromWalletB
            .topUp({coinsA: new BN(0), coinsB: channelInitState.balanceB})
            .send(channelInitState.balanceB.add(toNano('0.05'))); // +0.05 TON to network fees

        await fromWalletA.init(channelInitState).send(toNano('0.05'));

        const savedChannel = await ChannelModel.create({
            channelAddress: channelAddress.toString(true, true, true)
        })

        const link = await ApiKeyModel.findOne({apiKey: req.body.customer_wallet_address}).populate('channel')
        link.channel = savedChannel
        link.save()

        const ownerWalletAddress = await ownerWallet.getAddress()
        const customerWalletAddress = await customerWallet.getAddress()


        res.json({
            ownerWallet: ownerWalletAddress.toString(true, true, true),
            customerWallet: customerWalletAddress.toString(true, true, true),
            channelAddress: await channelAddress.toString(true, true, true)
        })
    });
})

router.get('/call_method', apiKeyMiddleware, async (req, res) => {
    const link = await ApiKeyModel.findOne({apiKey: req.key}).populate('owner customer channel', 'seed channelAddress')
    console.log(link)

    const ownerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(link.owner.seed))
    const customerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(link.customer.seed))

    const channelInitState = {
        balanceA: toNano('0'),
        balanceB: toNano('2'),
        seqnoA: new BN(0),
        seqnoB: new BN(0)
    };

    const ownerWallet = tonweb.wallet.create({
        publicKey: ownerKeyPair.publicKey
    });

    const customerWallet = tonweb.wallet.create({
        publicKey: customerKeyPair.publicKey
    });



    const channelConfig = {
        channelId: new BN(193), // Channel ID, for each new channel there must be a new ID
        addressA: await ownerWallet.getAddress(), // A's funds will be withdrawn to this wallet address after the channel is closed
        addressB: await customerWallet.getAddress(), // B's funds will be withdrawn to this wallet address after the channel is closed
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }

    const channelA = tonweb.payments.createChannel({
        ...channelConfig,
        isA: true,
        myKeyPair: ownerKeyPair,
        hisPublicKey: customerKeyPair.publicKey,
    });


    const channelB = tonweb.payments.createChannel({
        ...channelConfig,
        isA: false,
        myKeyPair: customerKeyPair,
        hisPublicKey: ownerKeyPair.publicKey,
    });

    const balance = await BalanceModel.findOne({channelAddress: link.channel.channelAddress})
    console.log(balance)
    if (balance) {
        if (parseFloat(balance.balanceB) < 0.5) {
            const signatureCloseB = await channelB.signClose(channelInitState);

            // A verifies and signs this closing message and include B's signature

            // A sends closing message to blockchain, payments channel smart contract
            // Payment channel smart contract will send funds to participants according to the balances of the sent state.

            if (!(await channelA.verifyClose(channelState3, signatureCloseB))) {
                throw new Error('Invalid B signature');
            }

            channelInitState.seqnoA = new BN(balance.seqnoA + 1)
            channelInitState.seqnoB = new BN(balance.seqnoB + 1)

            await fromWalletA.close({
                ...channelInitState,
                hisSignature: signatureCloseB
            }).send(toNano('0.05'));
            res.json({message: "Out of balance, channel closed."})
        }
        channelInitState.balanceA = toNano(toNumberString(parseFloat(balance.balanceA) + 0.5))
        channelInitState.balanceB = toNano(toNumberString(parseFloat(balance.balanceB) - 0.5))
        channelInitState.seqnoA = new BN(balance.seqnoA + 1)
        channelInitState.seqnoB = new BN(balance.seqnoB + 1)
    }


    const signatureB = await channelB.signState(channelInitState);

    if (!(await channelA.verifyState(channelInitState, signatureB))) {
        throw new Error('Invalid B signature');
    }
    await channelA.signState(channelInitState);
    console.log( link.channel.channelAddress)
    await saveBalance(channelInitState, req.key, link.channel.channelAddress, (err) => {
        if (err) return res.status(405).json({message: "Server Error."})
    })
    // console.log( link.channel.channelAddress)

    const method = req.methods[0]
    console.log(method.url)

    // fetch('http://' + method.url)
    //     .then(res => res.json())
    //     .then(json => {
    //         res.json(json)
    //     })

    const options = {
        host: 'localhost:9000',
        path: '/sensor',
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    };

    // let request = https.get(options, (response) => {
    //     if (response.statusCode !== 200) {
    //         console.error(`Did not get an OK from the server. Code: ${response.statusCode}`);
    //         response.resume();
    //         return;
    //     }
    //
    //     let data = '';
    //
    //     response.on('data', (chunk) => {
    //         data += chunk;
    //     });
    //
    //     response.on('close', () => {
    //         console.log('Retrieved all data');
    //         res.json(JSON.parse(data));
    //     });
    // });

    await (async () => {
        const response = await fetch('https://petstore.swagger.io/v2/store/inventory')
        const answer = await response.json()
        res.json({result: answer,
            balance: {your_balance: channelInitState.balanceB.toString()}})
    })()

    // request.get('http://' + method.url, {headers: {
    //         'Content-Type': 'application/json'
    //     },}, (err, response, body) => {
    //     console.log(body)
    //     console.log(method.url)
    //     console.log(response)
    //     const result = JSON.parse(body);
    //     res.json({result: result, balance: {your_balance: channelInitState.balanceB}})
    // })



})

router.post('/exit_channel', apiKeyMiddleware, async (req, res) => {
    const link = await ApiKeyModel.findOne({apiKey: req.key}).populate('owner customer', 'seed')

    const ownerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(link.owner.seed))
    const customerKeyPair = tonweb.utils.keyPairFromSeed(string_to_uint8array(link.customer.seed))

    const ownerWallet = tonweb.wallet.create({
        publicKey: ownerKeyPair.publicKey
    });

    const customerWallet = tonweb.wallet.create({
        publicKey: customerKeyPair.publicKey
    });

    const channelInitState = {
        balanceA: toNano('0'),
        balanceB: toNano('2'),
        seqnoA: new BN(0),
        seqnoB: new BN(0)
    };



    const channelConfig = {
        channelId: new BN(193), // Channel ID, for each new channel there must be a new ID
        addressA: await ownerWallet.getAddress(), // A's funds will be withdrawn to this wallet address after the channel is closed
        addressB: await customerWallet.getAddress(), // B's funds will be withdrawn to this wallet address after the channel is closed
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    }

    const channelA = tonweb.payments.createChannel({
        ...channelConfig,
        isA: true,
        myKeyPair: ownerKeyPair,
        hisPublicKey: customerKeyPair.publicKey,
    });


    const channelB = tonweb.payments.createChannel({
        ...channelConfig,
        isA: false,
        myKeyPair: customerKeyPair,
        hisPublicKey: ownerKeyPair.publicKey,
    });


    const fromWalletA = channelA.fromWallet({
        wallet: ownerWallet,
        secretKey: ownerKeyPair.secretKey
    });

    const fromWalletB = channelB.fromWallet({
        wallet: customerWallet,
        secretKey: customerKeyPair.secretKey
    });

    const balance = await BalanceModel.findOne({channelAddress: link.channel.channelAddress})
    if (balance) {
        channelInitState.balanceA = toNano(balance.balanceA)
        channelInitState.balanceB = toNano(balance.balanceB)
        channelInitState.seqnoA = new BN(balance.seqnoA + 1)
        channelInitState.seqnoB = new BN(balance.seqnoB + 1)
    }

    const channelAddress = await channelA.getAddress()
    console.log(channelInitState.seqnoB, channelInitState.seqnoA)


    if ((await channelB.getAddress()).toString() !== channelAddress.toString()) {
        throw new Error('Channels address not same');
    }

    const signatureCloseB = await channelB.signClose(channelInitState, async (res) => {
        await setTimeout(7000)
        if (!(await channelA.verifyClose(channelInitState, signatureCloseB))) {
            throw new Error('Invalid B signature');
        }

        await fromWalletA.close({
            ...channelInitState,
            hisSignature: signatureCloseB
        }).send(toNano('0.05'));
    });
    res.json({message: "Channel closed!"})


})

module.exports = router
