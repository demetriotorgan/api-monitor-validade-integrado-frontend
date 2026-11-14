import express from 'express'
import { listarProdutoPorNome, listarProdutos, salvarProduto } from '../controllers/produto.controller.js';

const router = express.Router();

router.post('/salvarProduto', salvarProduto);
router.get('/listarProdutos', listarProdutos);
router.get('/buscar', listarProdutoPorNome);

export default router;