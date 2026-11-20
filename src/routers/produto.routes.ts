import express from 'express'
import { alterarProduto, deletarProduto, listarProdutoPorId, listarProdutoPorNome, listarProdutos, salvarProduto } from '../controllers/produto.controller.js';

const router = express.Router();

router.post('/salvarProduto', salvarProduto);
router.get('/listarProdutos', listarProdutos);
router.get('/buscar', listarProdutoPorNome);
router.get('/produto/:id', listarProdutoPorId);
router.patch('/alterarProduto/:id', alterarProduto);
router.delete('/deletarProduto/:id', deletarProduto);

export default router;