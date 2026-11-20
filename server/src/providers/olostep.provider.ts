import { OlostepError, type OlostepClient } from "../services/olostep.service.js";
import {
  buildJsonFormat,
  buildTask,
  parseCustom,
  parseField,
  parseSignals,
} from "../validators/company.schema.js";
import { registrableDomain } from "../services/domain.service.js";
import {
  ProviderError,
  type CompanyEnrichmentProvider,
  type EnrichmentInput,
  type EnrichmentResult,
} from "./provider.js";

/**
 * Company research with one Olostep Answers request per company: Olostep searches,
 * reads and validates live web pages and returns JSON in the shape we ask for.
 * Only the company name and domain are sent; contact names and emails never leave the server.
 */
export class OlostepEnrichmentProvider implements CompanyEnrichmentProvider {
  readonly name = "olostep-answers";

  constructor(
    private readonly client: OlostepClient,
    private readonly creditsPerAnswer: number,
  ) {}

  async enrichCompany(input: EnrichmentInput): Promise<EnrichmentResult> {
    const task = buildTask({
      companyName: input.companyName,
      domain: input.domain,
      fields: input.fields,
      includeBuyingSignals: input.includeBuyingSignals,
      questions: input.customQuestions,
    });
    const format = buildJsonFormat(input.fields, input.includeBuyingSignals, input.customQuestions);

    let answer;
    try {
      answer = await this.client.answer(task, format, input.signal);
    } catch (err) {
      if (err instanceof OlostepError) throw new ProviderError(err.message, err.code, err.fatal);
      throw err;
    }

    const json = (answer.json && typeof answer.json === "object" ? answer.json : {}) as Record<
      string,
      unknown
    >;
    const reportedName = typeof json.company_name === "string" ? json.company_name.trim() : "";
    const reportedDomain =
      typeof json.domain === "string"
        ? registrableDomain(json.domain.replace(/^https?:\/\//, "").split("/")[0] ?? "")
        : null;

    return {
      companyName:
        reportedName && !/^not[\s_-]?found$/i.test(reportedName) ? reportedName : input.companyName,
      // Trust the domain from the user's data over the model's guess.
      domain: input.domain ?? reportedDomain,
      fields: Object.fromEntries(input.fields.map((f) => [f.key, parseField(f, json[f.key])])),
      buyingSignals: input.includeBuyingSignals ? parseSignals(json.buying_signals) : [],
      custom: parseCustom(json.custom_answers, input.customQuestions),
      sources: answer.sources,
      credits: this.creditsPerAnswer,
      providerRef: answer.id,
    };
  }
}
