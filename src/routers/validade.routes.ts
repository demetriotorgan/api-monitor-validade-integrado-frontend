
import express from 'express'

import { receberImagem } from '../controllers/multer.controller.js';
import { processarImagem } from '../controllers/processar.controller.js';

const router = express.Router();

router.post('/processar', receberImagem,processarImagem);

export default router;
