package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.SavingsDtos.*;
import com.smartexpense.backend.service.SavingsChallengeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/savings-challenges")
@RequiredArgsConstructor
public class SavingsChallengeController {
    private final SavingsChallengeService service;

    @GetMapping
    public ResponseEntity<Overview> overview(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.overview(owner(jwt)));
    }

    @GetMapping("/reward")
    public ResponseEntity<Reward> reward(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.reward(owner(jwt)));
    }

    @PostMapping
    public Challenge start(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateChallenge request) {
        return service.start(owner(jwt), request);
    }

    @PostMapping("/{id}/savings")
    public Challenge record(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody Saving request) {
        return service.record(owner(jwt), id, request);
    }

    @PostMapping("/import")
    public Challenge importChallenge(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ImportChallenge request) {
        return service.importChallenge(owner(jwt), request);
    }

    @PutMapping("/reward")
    public Reward selectMascot(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PreferenceRequest request) {
        return service.selectMascot(owner(jwt), request.useGoldenPig());
    }

    private static long owner(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
