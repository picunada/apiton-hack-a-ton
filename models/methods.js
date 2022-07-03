const mongoose = require('mongoose')

const Schema = mongoose.Schema

const MethodSchema = new Schema({
    url: String,
    description: String,
})

exports.MethodSchema = MethodSchema
