package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.ai.AiChatRequest;
import com.smartexpense.backend.dto.ai.AiChatResponse;
import com.smartexpense.backend.service.AiChatService;
import com.smartexpense.backend.service.AiGeminiReviews;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
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

    @PostMapping("/api/ai/chat/gemini/preview")
    public ResponseEntity<AiGeminiReviews.Preview> previewGemini(@AuthenticationPrincipal Jwt jwt,
                                                                @Valid @RequestBody AiChatRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(chat.previewGemini(Long.valueOf(jwt.getSubject()), request));
    }

    @PostMapping("/api/ai/chat/gemini/approve")
    public ResponseEntity<AiChatResponse> approveGemini(@AuthenticationPrincipal Jwt jwt,
                                                       @Valid @RequestBody GeminiApproval approval) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(chat.sendApprovedGemini(Long.valueOf(jwt.getSubject()), approval.previewId()));
    }

    public record GeminiApproval(@NotNull UUID previewId) { }
}
