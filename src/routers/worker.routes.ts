import express from 'express'
import { confirmarEnvioAlerta, listarAlertasPendentes } from '../controllers/validade.worker.controller.js';

const router = express.Router();

router.get('/alertas-pendentes', listarAlertasPendentes);
router.patch('/:id/confirmar-envio', confirmarEnvioAlerta);

export default router;