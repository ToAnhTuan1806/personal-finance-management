package com.smartexpense.backend.service;

public interface AiProvider {
    enum Action { REPLY, SUMMARY, CATEGORIES, BUDGET, COMPARISON, CATEGORY_TREND, TODAY, PROFILE, OUT_OF_SCOPE }

    record Answer(Action action, String text) {
        @Override public String toString() { return "AiProvider.Answer[redacted]"; }
    }

    String explain(String intent, AiFinancialContextService.Context context);

    Answer answerApproved(AiGeminiReviews.ApprovedQuestion question);
}
