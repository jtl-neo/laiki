import { describe, expect, it } from "vitest";
import { classifyIntent, parseSimpleQuery } from "./queryIntent.js";

describe("classifyIntent", () => {
  // queries
  it.each([
    "今日花費",
    "今天花了多少",
    "本月支出",
    "這週吃多少",
    "上個月花多少",
    "餐飲花了多少",
    "這個月收入多少",
    "今年總共花多少",
    "最大一筆是多少",
    "我這週花費怎樣",
    "本月花費?",
    "今天花多少錢",
  ])("classifies %s as query", (text) => {
    expect(classifyIntent(text)).toBe("query");
  });

  // records (must NOT become queries)
  it.each([
    "今天吃午餐200",
    "早餐 65 現金",
    "午餐花了120",
    "今日花費200",
    "和a和b吃麥當勞我先出500",
    "用共同基金買衛生紙450",
    "轉帳 215 從現金到 LINE Pay",
    "收到薪水52000",
    "買咖啡",
  ])("classifies %s as record", (text) => {
    expect(classifyIntent(text)).toBe("record");
  });
});

describe("parseSimpleQuery", () => {
  it("parses 今日花費", () => {
    expect(parseSimpleQuery("今日花費")).toMatchObject({ metric: "spend", period: "today" });
  });

  it("parses 本月支出", () => {
    expect(parseSimpleQuery("本月支出")).toMatchObject({ metric: "spend", period: "this_month" });
  });

  it("parses 這週吃多少 (category 餐飲)", () => {
    expect(parseSimpleQuery("這週吃多少")).toMatchObject({
      metric: "spend",
      period: "this_week",
      category: "餐飲",
    });
  });

  it("parses 上個月花多少", () => {
    expect(parseSimpleQuery("上個月花多少")).toMatchObject({
      metric: "spend",
      period: "last_month",
    });
  });

  it("parses 餐飲花了多少 (period defaults this_month)", () => {
    expect(parseSimpleQuery("餐飲花了多少")).toMatchObject({
      metric: "spend",
      period: "this_month",
      category: "餐飲",
    });
  });

  it("parses 這個月收入多少 as income", () => {
    expect(parseSimpleQuery("這個月收入多少")).toMatchObject({
      metric: "income",
      period: "this_month",
    });
  });

  it("parses 最大一筆 as biggest", () => {
    expect(parseSimpleQuery("這個月最大一筆")).toMatchObject({
      metric: "biggest",
      period: "this_month",
    });
  });

  it("returns null for clearly non-query text", () => {
    expect(parseSimpleQuery("午餐120")).toBeNull();
  });
});
