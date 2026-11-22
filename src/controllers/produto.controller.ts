import { NextFunction, Request, Response } from "express";
import { ProdutoModel } from "../models/Produto.js";
import { isValidObjectId, Types } from "mongoose";
import { AlterarProdutoBody, CriarProdutoBody } from "../types/produto.types.js";
import { ErroCadastroProduto, ErroEdicao } from "../erros/app-error.js";
import { ValidadeModel } from "../models/Validade.js";
import { escapeRegex, normalizarCodigoBarras } from "../utils/produto.utils.js";



export async function salvarProduto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { codigoBarras, nome } = req.body as CriarProdutoBody;

        // 1. Validação de tipo PRIMEIRO (corrige o bug do .trim() em número)
        if (typeof codigoBarras !== 'string' || typeof nome !== 'string') {
            throw new ErroCadastroProduto('Código de barras e nome devem ser strings válidas', 400);
        }

        // 2. Validação de vazio / só espaços
        if (!codigoBarras.trim() || !nome.trim()) {
            throw new ErroCadastroProduto('Código de barras e nome são obrigatórios', 400);
        }

        // 3. RF-04: Normalizar antes de salvar
        const codigoNormalizado = normalizarCodigoBarras(codigoBarras);

        // Se depois de limpar não sobrou nada, era só lixo: " - - "
        if (!codigoNormalizado) {
            throw new ErroCadastroProduto('Código de barras inválido após normalização', 400);
        }

        // 4. Criando novo produto
        const novo_produto = await ProdutoModel.create({
            codigoBarras: codigoNormalizado,
            nome: nome.trim(),
        });

        res.status(201).json({
            sucesso: true,
            mensagem: 'Produto criado com sucesso',
            produto: novo_produto,
        });
    } catch (error) {
        // Duplicidade do Mongo -> vira nossa classe com 409
        if (error instanceof Error && 'code' in error && error.code === 11000) {
            next(new ErroCadastroProduto('Já existe um produto cadastrado com esse código de barras', 409));
            return;
        }

        // Qualquer outro erro -> vai para o middleware
        next(error);
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

// RF-05: Buscar produto por código de barras exato
// GET /produtos/codigo/:codigoBarras
export async function buscarProdutoPorCodigoBarras(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const codigoParam = req.params.codigoBarras;
    const codigoRaw = Array.isArray(codigoParam) ? codigoParam[0] : codigoParam;

    if (!codigoRaw || typeof codigoRaw !== 'string' || !codigoRaw.trim()) {
      throw new ErroEdicao('Código de barras é obrigatório para busca', 400);
    }

    // Normaliza a busca do mesmo jeito que normaliza o cadastro
    // Operador digita "7891 234-567 890" -> busca "7891234567890"
    const codigoNormalizado = normalizarCodigoBarras(codigoRaw);

    if (!codigoNormalizado) {
      throw new ErroEdicao('Código de barras inválido após normalização', 400);
    }

    // Busca EXATA - sem regex, sem parcial
    // Usa o índice unique do codigoBarras, por isso é < 1s
    const produto = await ProdutoModel.findOne({
      codigoBarras: codigoNormalizado,
    }).lean();

    if (!produto) {
      throw new ErroEdicao('Produto não encontrado', 404);
    }

    res.status(200).json({
      sucesso: true,
      dados: produto,
    });
  } catch (error) {
    next(error);
  }
};

// RF-07: Listar produtos com paginação - VERSÃO NOVA, não quebra o front atual
// GET /produtos/paginado?page=1&limit=20&busca=mussarela
export async function listarProdutosPaginado(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Paginação - padrão do RF: 20 por página
    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const limitRaw = Math.floor(Number(req.query.limit)) || 20;
    // Trava para não deixar o front pedir 10.000 de uma vez e travar o banco
    const limit = Math.min(Math.max(1, limitRaw), 100);
    const skip = (page - 1) * limit;

    // 2. Filtro opcional - reaproveita a busca por nome/código se o front mandar
    // Se não mandar busca, lista tudo
    const buscaRaw = req.query.busca;
    const busca = typeof buscaRaw === 'string' ? buscaRaw.trim() : '';

    let filtro: Record<string, unknown> = {};

    if (busca) {
      const termo = busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro = {
        $or: [
          { nome: { $regex: termo, $options: 'i' } },
          { codigoBarras: { $regex: termo, $options: 'i' } },
        ],
      };
    }

    // 3. Busca paginada + total em paralelo
    const [produtos, total] = await Promise.all([
      ProdutoModel.find(filtro)
        .sort({ criadoEm: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProdutoModel.countDocuments(filtro),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      sucesso: true,
      dados: produtos,
      paginacao: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

export async function alterarProduto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const { id } = req.params;
        const { codigoBarras, nome } = req.body as AlterarProdutoBody;

        //1. ID invalido
        if (!isValidObjectId(id)) {
            throw new ErroEdicao('ID do produto invalido', 400);
        }

        const atualizacao: Partial<Record<string, string>> = {};

        if (codigoBarras !== undefined) {
            if (typeof codigoBarras !== "string" || !codigoBarras.trim()) {
                throw new ErroEdicao('Codigo de barras deve ser uma string não vazia', 400);
            }
            // RF-04: Normalizar também na edição
            const codigoNormalizado = normalizarCodigoBarras(codigoBarras);
            if (!codigoNormalizado) {
                throw new ErroEdicao('Código de barras inválido após normalização', 400);
            }
            atualizacao.codigoBarras = codigoNormalizado;
        }

        if (nome !== undefined) {
            if (typeof nome !== "string" || !nome.trim()) {
                throw new ErroEdicao('Nome deve ser uma string não vazia', 400);
            }
            atualizacao.nome = nome.trim();
        }

        if (Object.keys(atualizacao).length === 0) {
            throw new ErroEdicao('Nenhum campo valido foi enviado para atualização', 400);
        }

        const produtoAtualizado = await ProdutoModel.findByIdAndUpdate(
            id,
            { $set: atualizacao },
            { new: true, runValidators: true }
        ).lean();

        if (!produtoAtualizado) {
            throw new ErroEdicao('Produto não encontrado', 404);
        }

        res.status(200).json({
            sucesso: true,
            mensagem: "Produto alterado com sucesso",
            dados: produtoAtualizado,
        });
    } catch (error) {
        console.error("Erro ao alterar produto:", error);

        if (error instanceof Error && "code" in error && error.code === 11000) {
            next(new ErroEdicao('Já existe um produto cadastrado com esse código de barras', 409));
            return;
        }
        next(error);
    }
};

export async function deletarProduto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const idParam = req.params.id;
        const id = Array.isArray(idParam) ? idParam[0] : idParam;

        if (!id || !isValidObjectId(id)) {
            throw new ErroEdicao('ID do produto inválido', 400);
        }

        const validadeAtiva = await ValidadeModel.findOne({
            $or: [
                { "produto._id_produto": id },
                { "produto._id_produto": new Types.ObjectId(id) },
            ],
            validade: { $in: ["espera", "alerta"] },
        }).lean();

        if (validadeAtiva) {
            throw new ErroEdicao(
                'Não é possível deletar produto com validade ativa. Encerre ou exclua a validade primeiro.',
                409
            );
        }

        const produtoDeletado = await ProdutoModel.findByIdAndDelete(id).lean();

        if (!produtoDeletado) {
            throw new ErroEdicao('Produto não encontrado', 404);
        }

        res.status(200).json({
            sucesso: true,
            mensagem: 'Produto deletado com sucesso',
            dados: produtoDeletado,
        });
    } catch (error) {
        next(error);
    }
}