import { NextFunction, Request, Response } from 'express';
import { ValidadeModel } from '../models/Validade.js';
import { IValidade, IValidadeUpdatePayload } from '../types/validade.types.js';
import mongoose, { isValidObjectId } from 'mongoose';
import { formatarValidadeComStatus  } from '../utils/validade.utils.js';
import { AppError, ErroEdicao } from '../erros/app-error.js';
import { ProdutoModel } from '../models/Produto.js';
import { podeCriar } from '../validade-lifecycle/orquestrador/camada1-criacao.js';
import { decisaoParaErro } from '../validade-lifecycle/adaptador/mapa-erro.js';
import { podeEncerrar } from '../validade-lifecycle/orquestrador/camada2-encerramento.js';
import { podeCorrigir } from '../validade-lifecycle/orquestrador/camada2-correcao.js';
import { podeDeletar } from '../validade-lifecycle/orquestrador/camada2-deletar.js';
import { EntradaCorrecao } from '../types/lifecycle.type.js';


interface AlterarValidadeBody extends IValidadeUpdatePayload { }


export async function salvarValidade(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { data, produto, alerta } = req.body;

    // 1. Campos obrigatórios - RF-11 - MANTÉM
    if (!data?.data_iso || !produto?._id_produto) {
      throw new ErroEdicao('Os campos "data.data_iso" e "produto._id_produto" são obrigatórios.', 400);
    }

    // RF-15: Tem que ser inteiro > 0 - MANTÉM (regra mais restrita que a Camada 1)
    if (
      !alerta ||
      typeof alerta.dias_antecedencia !== 'number' ||
      !Number.isInteger(alerta.dias_antecedencia) ||
      alerta.dias_antecedencia <= 0
    ) {
      throw new ErroEdicao(
        'O período de alerta deve ser um número inteiro maior que zero. Ex: 1, 3, 7.',
        400
      );
    }

    // 2. Valida se o _id é ObjectId válido - MANTÉM
    const idProduto = String(produto._id_produto);
    if (!isValidObjectId(idProduto)) {
      throw new ErroEdicao('ID do produto inválido.', 400);
    }

    // 3. RF-12: Busca o produto REAL no banco - MANTÉM
    const produtoReal = await ProdutoModel.findById(idProduto).lean();
    if (!produtoReal) {
      throw new ErroEdicao('Produto não encontrado.', 404);
    }

    // 4. Valida data real - 31/02 não pode passar - MANTÉM
    const camposData = ['ano', 'mes', 'dia', 'data_iso', 'data_original'] as const;
    const dataIncompleta = camposData.some((c) => data[c] === undefined || data[c] === null);
    if (dataIncompleta) {
      throw new ErroEdicao('Todos os campos de "data" devem ser preenchidos.', 400);
    }

    // RF-16: Impedir duas validades iguais - MANTÉM, mas sobe para antes da Camada 1
    // Porque a Camada 1 precisa saber se já existe duplicata
    const duplicata = await ValidadeModel.findOne({
      'produto._id_produto': produtoReal._id,
      'data.data_iso': data.data_iso,
      validade: { $in: ['espera', 'alerta', 'vencido'] },
    }).lean();

    // [CAMADA 1] - ÚNICA MUDANÇA REAL
    // A partir daqui, a decisão de criar vem da Camada 1, não de ifs soltos.
    // Ela substitui isDataValidadeFutura + calcularStatus + check de duplicata.
    // Se ela negar, a gente lança o mesmo ErroEdicao de antes, com mesma mensagem.
    const decisao = podeCriar(
      {
        data_iso: data.data_iso,
        dias_antecedencia: alerta.dias_antecedencia,
        produto: produtoReal.nome || String(produtoReal._id),
      },
      !!duplicata
    );

    if (!decisao.autorizado) {
      // MODO SOMBRA: descomente a linha abaixo para só logar na primeira semana
      // console.warn('[CAMADA1-SOMBRA] Divergência:', decisao.codigo, decisao.motivo);
      // E comente o throw abaixo durante a sombra

      // MODO REAL: lança o erro
      throw decisaoParaErro(decisao.codigo, decisao.motivo);
    }

    // A partir daqui, decisao.proximoStatus é 'espera' ou 'alerta'
    // Nunca é 'vencido', nunca é 'encerrado'
    const statusValidade = decisao.proximoStatus;

    // 6. Monta o snapshot a partir do BANCO, não do front - MANTÉM
    const novaValidade = await ValidadeModel.create({
      data,
      produto: {
        _id_produto: produtoReal._id,
        codigoBarras: produtoReal.codigoBarras,
        nome: produtoReal.nome,
      },
      ml: {},
      alerta: {
        dias_antecedencia: alerta.dias_antecedencia,
      },
      validade: statusValidade,
    });

    // RF-19: Formata a resposta - MANTÉM
    const validadeFormatada = formatarValidadeComStatus(
      novaValidade.toObject() as IValidade
    );

    res.status(201).json({
      sucesso: true,
      mensagem: 'Validade salva com sucesso.',
      dados: validadeFormatada,
    });
  } catch (error) {
    next(error);
  }
};

// src/controllers/validade.encerramento.controller.ts
// Controller de encerramento - rota dedicada
// Só chama a Camada 2. Não decide regra nenhuma aqui.
// Só o humano encerra. Cron NUNCA chama essa rota.

export async function encerrarValidade(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return next(new AppError('ID inválido.', 400, 'ID_INVALIDO'));
    }

    // 1. Busca o registro - se não existe, 404
    const registro = await ValidadeModel.findById(id);
    if (!registro) {
      return next(new AppError('Registro de validade não encontrado.', 404, 'NAO_ENCONTRADO'));
    }

    // 2. Monta o atual a partir do BANCO, nunca do front
    // Front não manda status, não manda data, não manda nada
    // Só o id vem da URL
    const atual = {
      data_iso: registro.data.data_iso,
      dias_antecedencia: registro.alerta.dias_antecedencia,
    };

    // 3. Camada 2 decide - fonte única de verdade
    const decisao = podeEncerrar(registro.validade, atual);

    if (!decisao.autorizado) {
      const statusCode = ['JA_ENCERRADO', 'JA_VENCIDO', 'TRANSICAO_PROIBIDA'].includes(decisao.codigo)
        ? 409
        : 400;

      return next(new ErroEdicao(decisao.motivo, statusCode, decisao.codigo));
    }

    // 4. Aplica a transição decidida pela Camada 2
    registro.validade = decisao.proximoStatus!; // 'encerrado'
    const registroSalvo = await registro.save();

    // 5. Responde com o registro formatado
    // formatarValidade congela 'encerrado', não recalcula para espera/alerta
    return res.status(200).json({
      sucesso: true,
      mensagem: 'Registro encerrado com sucesso. Produto salvo antes de vencer.',
      dados: formatarValidadeComStatus(registroSalvo.toObject() as any),
    });
  } catch (err) {
    return next(err);
  }
};

export async function corrigirValidade(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return next(new AppError('ID inválido.', 400, 'ID_INVALIDO'));
    }

    // 1. Busca o registro - se não existe, 404
    const registro = await ValidadeModel.findById(id);
    if (!registro) {
      return next(new AppError('Registro de validade não encontrado.', 404, 'NAO_ENCONTRADO'));
    }

    // 2. Monta o atual a partir do BANCO, nunca do front
    const atual = {
      data_iso: registro.data.data_iso,
      dias_antecedencia: registro.alerta.dias_antecedencia,
    };

    // 3. Monta a correção a partir do FRONT, só os 2 campos editáveis
    // Qualquer outro campo que o front mandar (validade, produto, etc) é ignorado
    const correcao: EntradaCorrecao = {};
    if (req.body?.data?.data_iso !== undefined) {
      correcao.data_iso = req.body.data.data_iso;
    }
    if (req.body?.alerta?.dias_antecedencia !== undefined) {
      correcao.dias_antecedencia = req.body.alerta.dias_antecedencia;
    }

    // 4. Camada 2 decide
    const decisao = podeCorrigir(registro.validade, atual, correcao);

    if (!decisao.autorizado) {
      const statusCode =
        decisao.codigo === 'JA_ENCERRADO' || decisao.codigo === 'JA_VENCIDO'
          ? 409
          : 400;

      return next(new ErroEdicao(decisao.motivo, statusCode, decisao.codigo));
    }

    // 5. Aplica só o que veio na correção
    if (correcao.data_iso !== undefined) {
      // Atualiza data_iso + ano/mes/dia juntos, para não ficar inconsistente
      // Ex: "2027-02-10" -> ano 2027, mes 2, dia 10
      const [ano, mes, dia] = correcao.data_iso.split('-').map(Number);
      registro.data.data_iso = correcao.data_iso;
      registro.data.ano = ano;
      registro.data.mes = mes;
      registro.data.dia = dia;
    }
    if (correcao.dias_antecedencia !== undefined) {
      registro.alerta.dias_antecedencia = correcao.dias_antecedencia;
    }

    // 6. Aplica o próximo status decidido pela Camada 2
    registro.validade = decisao.proximoStatus!; // 'espera' ou 'alerta'

    const registroSalvo = await registro.save();

    return res.status(200).json({
      sucesso: true,
      mensagem: 'Registro corrigido com sucesso.',
      dados: formatarValidadeComStatus(registroSalvo.toObject() as any),
    });
  } catch (err) {
    console.error('[corrigirValidade]', err);
    return next(err);
  }
};

export async function listarValidadePorId(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      throw new AppError('ID da validade inválido.', 400, 'ID_INVALIDO');
    }

    const validade = await ValidadeModel.findById(id).lean();

    if (!validade) {
      throw new AppError('Validade não encontrada.', 404, 'NAO_ENCONTRADO');
    }

    // Camada 1: recalcula, não salva
    // Depois da correção do formatar, só encerrado congela
    const validadeFormatada = formatarValidadeComStatus(
      validade as unknown as IValidade
    );

    res.status(200).json({
      sucesso: true,
      dados: validadeFormatada,
    });
  } catch (erro) {
    next(erro);
  }
};

export async function deletarValidade(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!id || !isValidObjectId(id)) {
      throw new AppError('ID da validade inválido.', 400, 'ID_INVALIDO');
    }

    // 1. Busca primeiro para checar o status - não pode deletar direto
    const validade = await ValidadeModel.findById(id).lean();

    if (!validade) {
      throw new AppError('Validade não encontrada.', 404, 'NAO_ENCONTRADO');
    }

    // 2. Monta o atual a partir do BANCO, nunca do front
    const atual = {
      data_iso: validade.data.data_iso,
      dias_antecedencia: validade.alerta.dias_antecedencia,
    };

    // 3. Camada 2 decide - controller não decide nada
    const decisao = podeDeletar(validade.validade, atual);

    if (!decisao.autorizado) {
      throw new AppError(
        decisao.motivo ?? 'Exclusão não permitida.',
        decisao.codigo === 'JA_ENCERRADO' || decisao.codigo === 'JA_VENCIDO'
          ? 409
          : 400,
        decisao.codigo ?? 'TRANSICAO_PROIBIDA'
      );
    }

    // 4. Só chega aqui se for espera ou alerta real
    const validadeDeletada = await ValidadeModel.findByIdAndDelete(id).lean();

    res.status(200).json({
      sucesso: true,
      mensagem: 'Validade deletada com sucesso',
      dados: validadeDeletada,
    });
  } catch (error) {
    next(error);
  }
}