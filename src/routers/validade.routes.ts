
import express from 'express'

import { receberImagem } from '../controllers/multer.controller.js';
import { processarImagem } from '../controllers/validade.controller.js';

const router = express.Router();

router.post('/validade', receberImagem,processarImagem);

export default router;
