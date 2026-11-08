import express from 'express'
import 'dotenv/config'
import cors from 'cors';

import multerRoutes from './routers/validade.routes.js'


const app = express();
app.use(cors());
app.use(express.json());



const PORT = Number(process.env.PORT) || 3000;

app.get('/', (_req,res)=>{
    res.status(200).json({
        sucesso:true,
        mensagem:'API Leitor de Validade funcionando'
    })
});

app.use('/api', multerRoutes);

app.listen(PORT, ()=>{
    console.log(`Servidor rodando na porta ${PORT}`);
})
