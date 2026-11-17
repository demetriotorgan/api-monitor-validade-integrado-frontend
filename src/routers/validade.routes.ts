
import express from 'express'

import { receberImagem } from '../controllers/multer.controller.js';
import { processarImagem } from '../controllers/processar.controller.js';
import { alterarValidade, deletarValidade, listarValidadePorId, salvarValidade } from '../controllers/validade.controller.js';
import { confirmarEnvioAlerta, limparTodasValidades, listarAlertasPendentes, listarValidadesComStatus } from '../controllers/validade.status.controller.js';

const router = express.Router();

router.post('/processar', receberImagem,processarImagem);

//-----validade.controller
router.post('/salvarValidade', salvarValidade);
router.patch('/alterarValidade/:id', alterarValidade);
router.get('/validade/:id', listarValidadePorId);
router.delete('/deletarValidade/:id', deletarValidade);

//-----status.controller
router.get('/com-status', listarValidadesComStatus);
router.get('/alertas-pendentes', listarAlertasPendentes);
router.patch('/:id/confirmar-envio', confirmarEnvioAlerta);

router.delete('/limpar-dev', limparTodasValidades);

export default router;
