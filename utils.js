const {BalanceModel, ApiKeyModel} = require("./models/api_keys");

async function saveBalance(state, key, channelAddress) {
    try {
        const balanceA = parseInt(state.balanceA.toString())/1000000000;
        const balanceB = parseInt(state.balanceB.toString())/1000000000;
        const seqnoA = await state.seqnoA.toNumber();
        const seqnoB = await state.seqnoB.toNumber();

        const link = await ApiKeyModel.findOne({apiKey: key}).populate('balance')
        if (link.balance) {
            link.balance.balanceA = balanceA
            link.balance.balanceB = balanceB
            link.balance.seqnoA = seqnoA
            link.balance.seqnoB = seqnoB
        } else {
            const balance = new BalanceModel({
                balanceA: balanceA,
                balanceB: balanceB,
                seqnoA: seqnoA,
                seqnoB: seqnoB,
                channelAddress: channelAddress
            })
            const savedBalance = balance.save();
            link.balance = savedBalance._id
            link.save()
        }
    } catch (err) {
        console.error(err)
    }
}

function toNumberString(num) {
    if (Number.isInteger(num)) {
        return num + ".0"
    } else {
        return num.toString();
    }
}

exports.toNumberString = toNumberString
exports.saveBalance = saveBalance
