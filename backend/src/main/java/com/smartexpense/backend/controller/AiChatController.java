package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.service.AiChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class AiChatController {
    private final AiChatService chat;

    @PostMapping("/api/ai/chat")
    public ResponseEntity<AiChatResponse> chat(@AuthenticationPrincipal Jwt jwt,
                                             @Valid @RequestBody AiChatRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(chat.chat(Long.valueOf(jwt.getSubject()), request));
    }
}
