import 'dotenv/config'
import express from 'express'
import cors from 'cors';
import connectDB from './config/db.js';

import validadeRoutes from './routers/validade.routes.js'

const startServer = async () => {
    await connectDB();

    const app = express();


    app.use(express.json());
    app.use(cors());



    const PORT = Number(process.env.PORT) || 3000;

    app.get('/', (_req, res) => {
        res.status(200).json({
            sucesso: true,
            mensagem: 'API Leitor de Validade funcionando'
        })
    });

    app.use('/api', validadeRoutes);

    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    })
};

startServer();
