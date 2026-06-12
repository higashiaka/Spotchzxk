package com.spotchzxk.infrastructure.config;

import com.spotchzxk.domain.user.repository.UserRepository;
import com.spotchzxk.infrastructure.security.FirebaseTokenFilter;
import com.spotchzxk.application.AccountLinkService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.cors-origin}")
    private String corsOriginRaw;

    @Bean
    public FirebaseTokenFilter firebaseTokenFilter(UserRepository userRepository, AccountLinkService accountLinkService) {
        return new FirebaseTokenFilter(userRepository, accountLinkService);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, FirebaseTokenFilter firebaseTokenFilter) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/health", "/ws/**", "/api/auth/me", "/error").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/stocks", "/api/stocks/*/candles", "/api/stocks/*/order-book", "/api/orders/recent", "/api/orders/history", "/api/online-count", "/api/rankings", "/api/shop/megaphone/posts", "/api/announcements/stock-splits/latest").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/guest/precheck").permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/auth/link-google").hasRole("GOOGLE")
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/stocks").hasRole("GOOGLE")
            // Issue #27/#20: /api/admin/** requires Google auth; anyRequest().authenticated() would allow guest tokens
                .requestMatchers("/api/admin/**").hasRole("GOOGLE")
                .anyRequest().authenticated()
            )
            .addFilterBefore(firebaseTokenFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(corsOriginRaw.split(",")));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}


