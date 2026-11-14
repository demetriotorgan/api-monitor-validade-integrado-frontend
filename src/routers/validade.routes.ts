
import express from 'express'

import { receberImagem } from '../controllers/multer.controller.js';
import { processarImagem } from '../controllers/processar.controller.js';
import { salvarValidade } from '../controllers/validade.controller.js';

const router = express.Router();

router.post('/processar', receberImagem,processarImagem);
router.post('/salvarValidade', salvarValidade);

export default router;
