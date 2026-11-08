import Groq from 'groq-sdk';

let clienteGroq: Groq | undefined;

export function obterClienteGroq(): Groq {
    if (clienteGroq) {
        return clienteGroq;
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error(
            'A variável GROQ_API_KEY não está configurada.',
        );
    }

    clienteGroq = new Groq({
        apiKey,
    });

    return clienteGroq;
}
