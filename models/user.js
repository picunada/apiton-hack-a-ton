const mongoose = require('mongoose');
const {MethodSchema} = require("./methods");

//Define a schema
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    email: String,
    name: String,
    password: String,
    walletAddress: String,
    seed: String,
    methods: [MethodSchema]
}, { versionKey: false });

const CustomerSchema = new Schema(
    {
        name: String,
        walletAddress: String,
        seed: String
    }, { versionKey: false });

exports.UserModel = mongoose.model('Users', UserSchema)
exports.UserSchema = UserSchema
exports.CustomerModel = mongoose.model('Customer', CustomerSchema)
exports.CustomerSchema = CustomerSchema