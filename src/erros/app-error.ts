/**
 * RF-32 - Classe Base de Erro
 * Todos os erros da aplicação herdam desta classe.
 * Usada por todos os controllers.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly codigo: string;

  constructor(mensagem: string, statusCode: number = 400, codigo: string = 'ERRO_GENERICO') {
    super(mensagem);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.codigo = codigo;

    // Mantém o stack trace correto no Node
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * RF-33 - ErroCadastroProduto
 * Usado no cadastro de produto (salvarProduto)
 * Herda de: Classe Base RF-32
 */
export class ErroCadastroProduto extends AppError {
  constructor(mensagem: string, statusCode: number = 400) {
    super(mensagem, statusCode, 'ERRO_CADASTRO_PRODUTO');
  }
}

/**
 * RF-35 - ErroEdicao
 * Usado na edição de produto + validade
 * Herda de: Classe Base RF-32
 * Ex: tentar editar produto com código duplicado, tentar editar registro VENCIDO / ENCERRADO
 */
export class ErroEdicao extends AppError {
  constructor(mensagem: string, statusCode: number = 400) {
    super(mensagem, statusCode, 'ERRO_EDICAO');
  }
}