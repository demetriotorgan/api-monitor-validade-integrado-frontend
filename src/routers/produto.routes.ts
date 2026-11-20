import express from 'express'
import { alterarProduto, buscarProdutoPorCodigoBarras, deletarProduto, listarProdutoPorId, listarProdutoPorNome, listarProdutos, listarProdutosPaginado, salvarProduto } from '../controllers/produto.controller.js';

const router = express.Router();

router.get('/produtos/paginado', listarProdutosPaginado);
router.post('/salvarProduto', salvarProduto);
router.get('/listarProdutos', listarProdutos);
router.get('/buscar', listarProdutoPorNome);
router.get('/produtos/codigo/:codigoBarras', buscarProdutoPorCodigoBarras);
router.get('/produto/:id', listarProdutoPorId);
router.patch('/alterarProduto/:id', alterarProduto);
router.delete('/deletarProduto/:id', deletarProduto);

export default router;