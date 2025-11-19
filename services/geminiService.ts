
import { GoogleGenAI } from "@google/genai";
import { Transaction, TransactionType, User, PaymentMethod } from "../types";

// Check for API Key but don't crash if missing, just disable feature
const apiKey = process.env.API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const getFinancialAdvice = async (
  transactions: Transaction[],
  month: string,
  user: User
): Promise<string> => {
  if (!ai) {
    return "Chave de API do Gemini não configurada. Configure o arquivo .env para receber conselhos.";
  }

  const userTransactions = transactions.filter(t => t.user === user);
  
  // Summarize data for the model
  const summary = userTransactions.reduce((acc, t) => {
    if (t.type === TransactionType.INCOME) acc.income += t.amount;
    else acc.expense += t.amount;
    return acc;
  }, { income: 0, expense: 0 });

  const categories = userTransactions
    .filter(t => t.type === TransactionType.EXPENSE)
    .map(t => `${t.description}: R$ ${t.amount.toFixed(2)}`)
    .join('\n');

  const prompt = `
    Atue como um consultor financeiro pessoal para a família Hamm.
    Usuário: ${user}.
    Mês de referência: ${month}.
    
    Resumo:
    Ganhos: R$ ${summary.income.toFixed(2)}
    Gastos: R$ ${summary.expense.toFixed(2)}
    Saldo: R$ ${(summary.income - summary.expense).toFixed(2)}
    
    Principais gastos:
    ${categories.slice(0, 1000)}... (lista truncada)

    Analise brevemente a saúde financeira deste mês. 
    Se o saldo for negativo, dê uma dica prática e dura. 
    Se for positivo, dê uma dica de investimento ou poupança.
    Mantenha a resposta curta, amigável mas direta (máximo 3 frases).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Não foi possível gerar um conselho no momento.";
  } catch (error) {
    console.error("Error fetching Gemini advice:", error);
    return "Erro ao conectar com o consultor financeiro.";
  }
};

export const parseReceiptImage = async (base64Image: string): Promise<any> => {
  if (!ai) return null;

  const prompt = `
    Analise a imagem deste comprovante/recibo/tela de maquininha.
    Extraia as seguintes informações e retorne APENAS um JSON válido (sem markdown):
    {
      "description": "Nome do estabelecimento ou descrição curta",
      "amount": 0.00 (número, valor total),
      "date": "YYYY-MM-DD" (data da compra, se não tiver use hoje),
      "paymentMethod": "CREDIT_CARD" ou "CASH_DEBIT",
      "last4Digits": "1234" (string, os ultimos 4 digitos do cartão se aparecer, senão null)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]
      }
    });

    const text = response.text;
    // Clean up markdown if present
    const jsonString = text?.replace(/```json/g, '').replace(/```/g, '').trim();
    
    if (jsonString) {
      return JSON.parse(jsonString);
    }
    return null;
  } catch (error) {
    console.error("Erro ao analisar imagem:", error);
    return null;
  }
}