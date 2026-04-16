import { Provider, ChatMessage } from "./base.js";

// 轻量级规则引擎：基于关键词和模式识别常见针对老人的虚假信息
// 不依赖任何大模型，零配置即可使用

interface Rule {
  id: string;
  patterns: RegExp[];
  score: number; // 匹配后降低到的分数
  verdict: "misinformation" | "scam" | "suspicious";
  redFlagZh: string;
  redFlagEn: string;
  elderZh: string;
  elderEn: string;
  actionZh: string;
  actionEn: string;
  summaryZh: string;
  summaryEn: string;
}

const rules: Rule[] = [
  {
    id: "soften-blood-vessels",
    patterns: [/软化血管/, /喝醋.*血管/, /血管.*硬化.*(吃|喝)/, /清理血管/],
    score: 15,
    verdict: "misinformation",
    redFlagZh: '"软化血管"不是医学概念，动脉粥样硬化不可逆',
    redFlagEn: '"Softening blood vessels" is not a medical concept; atherosclerosis is irreversible.',
    elderZh: "血管变硬就像水管老化，喝醋洗不干净，喝多了反而伤胃。医院大夫没这么说过。",
    elderEn: "Hardened blood vessels are like aging pipes; vinegar won't clean them, and too much can hurt your stomach. Doctors don't say this.",
    actionZh: "提醒老人不要相信此类养生偏方，如有血管问题应去医院就诊。",
    actionEn: "Remind the elder not to believe such folk remedies. Go to the hospital for real vascular issues.",
    summaryZh: "典型的健康养生谣言，利用老年人对心血管疾病的恐惧进行传播，没有科学依据。",
    summaryEn: "A typical health hoax exploiting elderly fear of cardiovascular disease, with no scientific basis.",
  },
  {
    id: "acid-base-constitution",
    patterns: [/酸碱体质/, /酸性体质.*癌/, /碱性食物.*防癌/, /体质偏酸/],
    score: 10,
    verdict: "misinformation",
    redFlagZh: '"酸碱体质"理论已被医学界否定，创始人曾在美国被判罚',
    redFlagEn: '"Acid-base constitution" theory has been debunked; its founder was fined in the US.',
    elderZh: "人的身体不会分成酸性和碱性，吃什么都改变不了。这是骗人的说法。",
    elderEn: "The human body doesn't divide into acidic and alkaline types. Food can't change that. This is a scam.",
    actionZh: "如果老人已购买相关保健品，建议保留证据并向市场监管部门举报。",
    actionEn: "If the elder bought related health products, keep evidence and report to consumer protection authorities.",
    summaryZh: "已被辟谣多年的伪科学理论，常被用于推销保健品和特殊食品。",
    summaryEn: "A long-debunked pseudoscience often used to sell health products and special foods.",
  },
  {
    id: "fake-expert",
    patterns: [/专家.*说/, /院士.*透露/, /医生.*提醒/, /哈佛.*研究/, /美国.*发现/],
    score: 35,
    verdict: "suspicious",
    redFlagZh: "未提供具体姓名、机构和文献来源，属于典型的'权威嫁接'",
    redFlagEn: "No specific name, institution, or source is provided — classic false authority appeal.",
    elderZh: "真正的大夫和科学家发文章都会写名字和单位。没名字的专家多半是假的。",
    elderEn: "Real doctors and scientists always put their names and affiliations on publications. Unnamed 'experts' are usually fake.",
    actionZh: "建议搜索原文出处，或通过国家卫健委、医院官方渠道核实。",
    actionEn: "Search for the original source, or verify through official health channels.",
    summaryZh: "通过伪造专家身份增加内容可信度，常见于健康养生和食品安全谣言。",
    summaryEn: "Uses fake expert identities to boost credibility, common in health and food safety hoaxes.",
  },
  {
    id: "bandwagon",
    patterns: [/群里都在转/, /朋友圈.*传疯了/, /不转不是.*人/, /大家都在看/, /已经.*人了/],
    score: 40,
    verdict: "suspicious",
    redFlagZh: "利用从众心理和道德绑架，与内容真实性无关",
    redFlagEn: "Exploits bandwagon psychology and moral blackmail, unrelated to factual accuracy.",
    elderZh: "转发的人多不代表内容是真的。很多谣言就是靠'大家都在转'才传开的。",
    elderEn: "Many people forwarding something doesn't make it true. Many hoaxes spread exactly this way.",
    actionZh: "告诉老人不必因为'大家都在转'而感到压力，独立思考最重要。",
    actionEn: "Tell the elder not to feel pressured by 'everyone is sharing it.' Independent thinking matters most.",
    summaryZh: "典型的情感操纵手法，通过制造社会压力迫使人传播信息。",
    summaryEn: "A typical emotional manipulation tactic that creates social pressure to spread information.",
  },
  {
    id: "urgency-threat",
    patterns: [/紧急通知/, /速看.*删除/, /马上.*来不及了/, /最后.*小时/, /国家.*秘密/],
    score: 20,
    verdict: "scam",
    redFlagZh: "制造紧迫感和恐惧，是诈骗和谣言的常见开场白",
    redFlagEn: "Creates urgency and fear — a common opening for scams and hoaxes.",
    elderZh: "真正重要的通知不会用'速看马上要删'这种吓唬人的话。别点里面的链接。",
    elderEn: "Real important announcements don't use scary phrases like 'watch before deletion.' Don't click any links.",
    actionZh: "务必检查信息来源，不要点击不明链接，更不要填写个人信息或转账。",
    actionEn: "Always check the source, don't click unknown links, and never share personal info or transfer money.",
    summaryZh: "通过紧迫感和恐惧心理诱导用户快速行动，常伴随钓鱼链接或诈骗。",
    summaryEn: "Induces quick action through urgency and fear, often accompanied by phishing links or fraud.",
  },
  {
    id: "lottery-scam",
    patterns: [/恭喜发财.*领取/, /中奖.*点击/, /红包.*领取/, /免费.*抽奖/, /幸运用户/],
    score: 5,
    verdict: "scam",
    redFlagZh: "天上不会掉馅饼，要求先点击、先付款、先填信息的多为诈骗",
    redFlagEn: "There's no free lunch. Requests to click, pay, or fill in information first are usually scams.",
    elderZh: "无缘无故中奖都是骗人的。点进去可能被骗钱，或者手机中病毒。",
    elderEn: "Winning a prize out of nowhere is always a scam. Clicking may steal money or infect the phone.",
    actionZh: "立即删除此类消息，不要点击任何链接，必要时报警。",
    actionEn: "Delete such messages immediately, don't click any links, and call the police if necessary.",
    summaryZh: "典型的中奖诈骗或钓鱼链接，目标是骗取钱财或个人信息。",
    summaryEn: "A typical prize scam or phishing link aiming to steal money or personal information.",
  },
  {
    id: "cancer-food",
    patterns: [/(吃|不吃).*癌/, /(食物|蔬菜|水果).*致癌/, /致癌.*名单/, /千万别吃/],
    score: 25,
    verdict: "misinformation",
    redFlagZh: "将单一食物与癌症直接挂钩，忽略了剂量、个体差异和整体饮食结构",
    redFlagEn: "Directly links a single food to cancer, ignoring dosage, individual differences, and overall diet.",
    elderZh: "没有哪一种食物吃了就一定得癌，也没有哪一种吃了就一定防癌。均衡饮食最重要。",
    elderEn: "No single food guarantees cancer, and no single food prevents it. A balanced diet is what matters.",
    actionZh: "如有饮食健康疑虑，建议咨询正规医院营养科，不要轻信网络榜单。",
    actionEn: "For dietary concerns, consult a hospital nutritionist instead of online lists.",
    summaryZh: "夸大单一食物的致癌或防癌效果，属于伪科学饮食谣言。",
    summaryEn: "Exaggerates the cancer-causing or cancer-preventing effects of a single food, pseudoscience.",
  },
  {
    id: "government-deception",
    patterns: [/国家.*政策/, /政府.*补贴/, /社保.*更新/, /医保.*停用/, /养老金.*调整/],
    score: 15,
    verdict: "scam",
    redFlagZh: "冒充政府部门或官方政策，要求点击链接或提供个人信息",
    redFlagEn: "Impersonates government departments or official policies, demanding clicks or personal info.",
    elderZh: "政府发通知会打电话或上门的，不会发一个链接让你点。千万别填身份证和银行卡。",
    elderEn: "The government calls or visits for official notices, not via random links. Never enter ID or bank card info.",
    actionZh: "通过政府官网（.gov.cn）或拨打 12345 市民热线核实。",
    actionEn: "Verify through official government websites (.gov.cn) or the 12345 hotline.",
    summaryZh: "冒充政府机构进行诈骗，老年人是重点受害群体。",
    summaryEn: "Impersonates government agencies to scam people, with elders as the primary victims.",
  },
];

export class RuleBasedProvider implements Provider {
  name = "rule-based";

  async chat(messages: ChatMessage[]): Promise<string> {
    const userContent = messages.find((m) => m.role === "user")?.content || "";
    const content = userContent.replace(/---/g, "").trim();

    const matchedRules = rules.filter((rule) =>
      rule.patterns.some((p) => p.test(content))
    );

    if (matchedRules.length === 0) {
      return JSON.stringify({
        credibilityScore: 60,
        verdict: "suspicious",
        redFlags: [
          {
            zh: "未匹配到已知谣言模式，但网络内容仍需保持警惕",
            en: "No known hoax pattern matched, but online content still warrants caution.",
          },
        ],
        elderExplanation: {
          zh: "这条消息我之前没见过，不太好判断真假。咱们还是小心点，别急着转发。",
          en: "I haven't seen this message before, so it's hard to judge. Let's be careful and not rush to forward it.",
        },
        actionSuggestion: {
          zh: "建议通过权威媒体或官方渠道核实，或配置更强的 AI 模型进行深入分析。",
          en: "Verify through authoritative media or official channels, or configure a stronger AI model for deeper analysis.",
        },
        summary: {
          zh: "内容未触发本地规则库中的已知谣言模式，可信度中等偏低。",
          en: "Content did not trigger known hoax patterns in the local rule base; credibility is moderately low.",
        },
      });
    }

    // 取最低分（最危险的）作为最终评分
    const finalScore = Math.min(...matchedRules.map((r) => r.score));
    const primaryRule = matchedRules.find((r) => r.score === finalScore) || matchedRules[0];

    const redFlags = matchedRules.map((r) => ({
      zh: r.redFlagZh,
      en: r.redFlagEn,
    }));

    return JSON.stringify({
      credibilityScore: finalScore,
      verdict: primaryRule.verdict,
      redFlags,
      elderExplanation: {
        zh: primaryRule.elderZh,
        en: primaryRule.elderEn,
      },
      actionSuggestion: {
        zh: primaryRule.actionZh,
        en: primaryRule.actionEn,
      },
      summary: {
        zh: primaryRule.summaryZh,
        en: primaryRule.summaryEn,
      },
    });
  }

  async healthCheck(): Promise<boolean> {
    return true; // 规则引擎永远可用
  }
}
