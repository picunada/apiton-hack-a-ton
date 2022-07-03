const express = require('express');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUI = require('swagger-ui-express')
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const usersRoute = require('./routes/user.js')
const apiKeyRoute = require('./routes/api_keys')
const mongoose = require('mongoose');

const app = express();
const port = 3000

app.use(bodyParser.json())
app.use(cors());
app.use(morgan('combined'));
app.use(helmet());
app.use('/users', usersRoute)
app.use('/api_key', apiKeyRoute)


app.get('/', (req, res) => {
    res.send({
        message: 'Hello!'
    })
})

// app.use(bodyParser.urlencoded({
//     extended: true
// }));



const mongoDB = 'mongodb://localhost:27017/db';
mongoose.connect(mongoDB, {
    authSource: "admin",
    user: "root",
    pass: "root",
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

//Get the default connection
const db = mongoose.connection;


db.on('error', console.error.bind(console, 'MongoDB connection error:'));

const swaggerOptions = {
    definition: {
        info: {
            title: 'Billing API',
            version: '1.0.0'
        },
        components:{
            securitySchemas:{
                bearerAuth:{
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            }
        ]
    },
    apis: ['./index.js', './routes/user.js'],
}
const swaggerSpec = swaggerJSDoc(swaggerOptions);

function swaggerDocs(app, port) {
    app.use('/docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec))

    app.get('docs.json', (req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.send(swaggerSpec)
    })

    console.log(`Docs available at localhost:${port}/docs`)
}



app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
    swaggerDocs(app, port)
})






