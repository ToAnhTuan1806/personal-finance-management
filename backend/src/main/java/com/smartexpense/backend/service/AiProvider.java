package com.smartexpense.backend.service;

public interface AiProvider {
    String explain(String intent, AiFinancialContextService.Context context);
}
