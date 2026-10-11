package com.luz.aiagent.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {
    @Bean
    public OpenAPI customOpenAPI() {
        // 配置 token 请求头
        return new OpenAPI()
                .info(new Info().title("API 文档").version("1.0").description("项目接口文档"))
                .addSecurityItem(new SecurityRequirement().addList("token"))
                .components(new io.swagger.v3.oas.models.Components()
                        .addSecuritySchemes("token", new SecurityScheme()
                                .name("token")
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .description("请在此处输入 token")
                        )
                );
    }
}
