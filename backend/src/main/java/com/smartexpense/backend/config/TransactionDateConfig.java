package com.smartexpense.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration(proxyBeanMethods = false)
public class TransactionDateConfig {

    @Bean
    Clock transactionDateClock() {
        return Clock.systemUTC();
    }
}
