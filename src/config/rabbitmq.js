const amqp = require("amqplib");

let connection;
let channel;

async function connectRabbitMQ(){
    connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();

    console.log("connected to RabbitMQ");
    return channel;
}

function getRabbitMQChannel(){
    if(!channel){
        throw new Error("RabbitMQ channel is not initialized");
    }

    return channel;
}

module.exports = { connectRabbitMQ, getRabbitMQChannel };