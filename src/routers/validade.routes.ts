
import express from 'express'

import { receberImagem } from '../controllers/multer.controller.js';
import { processarImagem } from '../controllers/processar.controller.js';
import { salvarValidade } from '../controllers/validade.controller.js';
import { confirmarEnvioAlerta, listarAlertasPendentes, listarValidadesComStatus } from '../controllers/validade.status.controller.js';

const router = express.Router();

router.post('/processar', receberImagem,processarImagem);
router.post('/salvarValidade', salvarValidade);

router.get('/com-status', listarValidadesComStatus);
router.get('/alertas-pendentes', listarAlertasPendentes);
router.patch('/:id/confirmar-envio', confirmarEnvioAlerta);

export default router;
