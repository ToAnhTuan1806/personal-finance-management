package com.smartexpense.backend.controller;

import com.smartexpense.backend.dto.SavingsDtos.*;
import com.smartexpense.backend.service.SavingsChallengeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
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

    @GetMapping("/funds")
    public ResponseEntity<Funds> funds(@AuthenticationPrincipal Jwt jwt) {
        Funds funds = service.funds(owner(jwt));
        if (funds == null) return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(funds);
    }

    @PostMapping("/{id}/fund/deposits")
    public ResponseEntity<FundUpdate> deposit(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                                               @Valid @RequestBody Saving request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.deposit(owner(jwt), id, request));
    }

    @PostMapping("/{id}/fund/withdrawals")
    public ResponseEntity<FundUpdate> withdraw(@AuthenticationPrincipal Jwt jwt, @PathVariable String id,
                                                @Valid @RequestBody Withdrawal request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.withdraw(owner(jwt), id, request));
    }

    @GetMapping("/reward")
    public ResponseEntity<Reward> reward(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.reward(owner(jwt)));
    }

    @PostMapping
    public Challenge start(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateChallenge request) {
        return service.start(owner(jwt), request);
    }

    @GetMapping(value = "/{id}/cover", produces = MediaType.IMAGE_JPEG_VALUE)
    public ResponseEntity<byte[]> cover(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.IMAGE_JPEG).body(service.cover(owner(jwt), id));
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
