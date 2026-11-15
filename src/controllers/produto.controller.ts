import { Request, Response } from "express";
import { ProdutoModel } from "../models/Produto.js";
import { isValidObjectId } from "mongoose";

interface CriarProdutoBody {
    codigoBarras: string;
    nome: string;
}

interface AtualizarProdutoBody {
    codigoBarras?: string;
    nome?: string;
}

interface AlterarProdutoBody {
    codigoBarras?: string;
    nome?: string;
}

export async function salvarProduto(req: Request, res: Response): Promise<void> {
    try {
        //1.Req Body
        const { codigoBarras, nome } = req.body as CriarProdutoBody;

        //2. Validando 
        if (!codigoBarras || !nome || !nome.trim() || !codigoBarras.trim()) {
            res.status(400).json({
                sucesso: false,
                erro: 'Codigo de barra e nome são obrigatórios'
            })
            return;
        }

        // Validação de tipo
        if (typeof codigoBarras !== "string" || typeof nome !== "string") {
            res.status(400).json({
                sucesso: false,
                erro: "Código de barras e nome devem ser strings válidas",
            });
            return;
        }

        //3. Criando novo produto
        const novo_produto = await ProdutoModel.create({
            codigoBarras: codigoBarras.trim(),
            nome: nome.trim()
        })
        res.status(201).json({
            sucesso: true,
            mensagem: 'Produto criado com sucesso',
            produto: novo_produto
        })
    } catch (error) {
        console.log('Erro ao salvar novo produto', error);
        // Tratamento específico para duplicidade de código de barras
        if (error instanceof Error && "code" in error && error.code === 11000) {
            res.status(409).json({
                sucesso: false,
                erro: "Já existe um produto cadastrado com esse código de barras",
            });
            return;
        }
        res.status(500).json({
            sucesso: false,
            erro: 'Erro ao salvar novo produto'
        })
    }
};

export const listarProdutos = async (req: Request, res: Response): Promise<void> => {
    try {
        //1. Buscar todos os produtos
        const produtos = await ProdutoModel.find().sort({ criadoEm: -1 }).lean();

        //2. Retonar resutlado
        res.status(200).json({
            sucesso: true,
            dados: produtos
        })
    } catch (error) {
        console.error('Erro ao listar produtos', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao listar produtos'
        })
    }
};

function escapeRegex(texto: string): string {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const listarProdutoPorNome = async (req: Request, res: Response): Promise<void> => {
    try {
        //1. Extrair query
        const { busca } = req.query;

        let filtro = {};

        if (busca && String(busca).trim()) {
            const termo = escapeRegex(String(busca).trim());
            filtro = {
                $or: [
                    { nome: { $regex: termo, $options: "i" } },
                    { codigoBarras: { $regex: termo, $options: "i" } },
                ],
            };
        }

        const produtos = await ProdutoModel.find(filtro)
            .sort({ criadoEm: -1 })
            .limit(20)
            .lean();

        res.status(200).json({
            sucesso: true,
            dados: produtos,
        });

    } catch (error) {
        console.error('Erro ao listar produto', error);
        res.status(500).json({
            sucesso: false,
            erro: 'Erro interno ao listar produtos'
        })
    }
};

export async function listarProdutoPorId(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                sucesso: false,
                erro: "ID do produto inválido",
            });
            return;
        }

        const produto = await ProdutoModel.findById(id).lean();

        if (!produto) {
            res.status(404).json({
                sucesso: false,
                erro: "Produto não encontrado",
            });
            return;
        }

        res.status(200).json({
            sucesso: true,
            dados: produto,
        });
    } catch (error) {
        console.error("Erro ao buscar produto por ID:", error);
        res.status(500).json({
            sucesso: false,
            erro: "Erro interno ao buscar produto",
        });
    }
};

export async function atualizarProduto(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { codigoBarras, nome } = req.body as AtualizarProdutoBody;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                sucesso: false,
                erro: "ID do produto inválido",
            });
            return;
        }

        const atualizacao: Partial<Record<string, string>> = {};

        if (codigoBarras !== undefined) {
            if (typeof codigoBarras !== "string" || !codigoBarras.trim()) {
                res.status(400).json({
                    sucesso: false,
                    erro: "Código de barras deve ser uma string não vazia",
                });
                return;
            }
            atualizacao.codigoBarras = codigoBarras.trim();
        }

        if (nome !== undefined) {
            if (typeof nome !== "string" || !nome.trim()) {
                res.status(400).json({
                    sucesso: false,
                    erro: "Nome deve ser uma string não vazia",
                });
                return;
            }
            atualizacao.nome = nome.trim();
        }

        if (Object.keys(atualizacao).length === 0) {
            res.status(400).json({
                sucesso: false,
                erro: "Nenhum campo válido foi enviado para atualização",
            });
            return;
        }

        const produtoAtualizado = await ProdutoModel.findByIdAndUpdate(
            id,
            { $set: atualizacao },
            { new: true, runValidators: true }
        ).lean();

        if (!produtoAtualizado) {
            res.status(404).json({
                sucesso: false,
                erro: "Produto não encontrado",
            });
            return;
        }

        res.status(200).json({
            sucesso: true,
            mensagem: "Produto atualizado com sucesso",
            dados: produtoAtualizado,
        });
    } catch (error) {
        console.error("Erro ao atualizar produto:", error);

        if (error instanceof Error && "code" in error && error.code === 11000) {
            res.status(409).json({
                sucesso: false,
                erro: "Já existe um produto cadastrado com esse código de barras",
            });
            return;
        }

        res.status(500).json({
            sucesso: false,
            erro: "Erro interno ao atualizar produto",
        });
    }
};

export async function alterarProduto(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { codigoBarras, nome } = req.body as AlterarProdutoBody;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                sucesso: false,
                erro: "ID do produto inválido",
            });
            return;
        }

        const atualizacao: Partial<Record<string, string>> = {};

        if (codigoBarras !== undefined) {
            if (typeof codigoBarras !== "string" || !codigoBarras.trim()) {
                res.status(400).json({
                    sucesso: false,
                    erro: "Código de barras deve ser uma string não vazia",
                });
                return;
            }
            atualizacao.codigoBarras = codigoBarras.trim();
        }

        if (nome !== undefined) {
            if (typeof nome !== "string" || !nome.trim()) {
                res.status(400).json({
                    sucesso: false,
                    erro: "Nome deve ser uma string não vazia",
                });
                return;
            }
            atualizacao.nome = nome.trim();
        }

        if (Object.keys(atualizacao).length === 0) {
            res.status(400).json({
                sucesso: false,
                erro: "Nenhum campo válido foi enviado para atualização",
            });
            return;
        }

        const produtoAtualizado = await ProdutoModel.findByIdAndUpdate(
            id,
            { $set: atualizacao },
            { new: true, runValidators: true }
        ).lean();

        if (!produtoAtualizado) {
            res.status(404).json({
                sucesso: false,
                erro: "Produto não encontrado",
            });
            return;
        }

        res.status(200).json({
            sucesso: true,
            mensagem: "Produto alterado com sucesso",
            dados: produtoAtualizado,
        });
    } catch (error) {
        console.error("Erro ao alterar produto:", error);

        if (error instanceof Error && "code" in error && error.code === 11000) {
            res.status(409).json({
                sucesso: false,
                erro: "Já existe um produto cadastrado com esse código de barras",
            });
            return;
        }

        res.status(500).json({
            sucesso: false,
            erro: "Erro interno ao alterar produto",
        });
    }
};

export async function deletarProduto(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        if (!isValidObjectId(id)) {
            res.status(400).json({
                sucesso: false,
                erro: "ID do produto inválido",
            });
            return;
        }

        const produtoDeletado = await ProdutoModel.findByIdAndDelete(id).lean();

        if (!produtoDeletado) {
            res.status(404).json({
                sucesso: false,
                erro: "Produto não encontrado",
            });
            return;
        }

        res.status(200).json({
            sucesso: true,
            mensagem: "Produto deletado com sucesso",
            dados: produtoDeletado,
        });
    } catch (error) {
        console.error("Erro ao deletar produto:", error);
        res.status(500).json({
            sucesso: false,
            erro: "Erro interno ao deletar produto",
        });
    }
}