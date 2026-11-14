import mongoose from 'mongoose';

let isConnected = false;

const connectDB = async(): Promise<void> =>{
    if(isConnected){
        return;
    };

    const mongoURI = process.env.MONGODB_URI;

    if(!mongoURI){
        console.error('Erro: MONGO_URI não definida no .env');
        process.exit(1);
    }

    try {
        const db = await mongoose.connect(mongoURI);
        isConnected = db.connection.readyState === 1;
        console.log(`MongoDB conectado ao banco: ${db.connection.name}`)
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB: ', error);
        process.exit(1);
    }
};

export default connectDB;