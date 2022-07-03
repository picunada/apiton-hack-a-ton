const mongoose = require('mongoose');
const {UserSchema, CustomerSchema} = require("./user");

//Define a schema
const Schema = mongoose.Schema;

const ChannelSchema = new Schema({
    channelAddress: String
})

const BalanceSchema = new Schema({
    balanceA: String,
    balanceB: String,
    seqnoA: Number,
    seqnoB: Number,
    channelAddress: String
}, { versionKey: false });

const ApiKeySchema = new Schema({
    apiKey: String,
    owner: { type: Schema.Types.ObjectId, ref: 'Users' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    balance: { type: Schema.Types.ObjectId, ref: 'Balance' },
    channel: { type: Schema.Types.ObjectId, ref: 'Channel' },
    costPerCall: String
}, { versionKey: false });


exports.BalanceSchema = BalanceSchema
exports.BalanceModel = mongoose.model('Balance', BalanceSchema)
exports.ChannelSchema = ChannelSchema
exports.ChannelModel = mongoose.model('Channel', ChannelSchema)
exports.ApiKeySchema = ApiKeySchema
exports.ApiKeyModel = mongoose.model('ApiKey', ApiKeySchema)

