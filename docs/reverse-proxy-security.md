# Cloudflare, Traefik e IP real

O rate limit só é confiável quando a cadeia de confiança está correta:

```text
cliente -> Cloudflare -> Traefik -> API (rede privada)
```

## Contrato de implantação

1. O firewall aceita tráfego ao origin somente da Cloudflare, ou o origin usa Cloudflare Tunnel.
2. No entrypoint do Traefik, `forwardedHeaders.insecure` permanece `false`.
3. `forwardedHeaders.trustedIPs` contém os CIDRs publicados pela Cloudflare para IPv4 e IPv6.
4. Traefik sobrescreve/normaliza os cabeçalhos encaminhados e é o único cliente de rede da API.
5. A API configura `TRUST_PROXY` com as redes exatas do Traefik. O padrão local aceita loopback e redes privadas; em produção, reduza essa lista à subnet real.
6. O código usa `request.ip`. Nunca confia diretamente em `CF-Connecting-IP`, pois esse cabeçalho pode ser falsificado se existir um caminho direto ao origin.
7. Web e API permanecem no mesmo site registrável. `CORS_ORIGIN` contém origens exatas, nunca `*`, para permitir o cookie `HttpOnly` com credenciais.

Exemplo parcial de configuração estática do Traefik (substitua pelos CIDRs oficiais atuais):

```yaml
entryPoints:
  websecure:
    address: ":443"
    forwardedHeaders:
      insecure: false
      trustedIPs:
        - "CIDR_IPV4_CLOUDFLARE"
        - "CIDR_IPV6_CLOUDFLARE"
```

Não copie uma lista de IPs antiga deste repositório. Atualize-a a partir dos endpoints oficiais `https://www.cloudflare.com/ips-v4` e `https://www.cloudflare.com/ips-v6` durante o provisionamento.

## Limites

- API geral: 120 requisições por minuto por IP.
- Login: 5 tentativas por minuto por IP.
- O armazenamento padrão é em memória e atende uma réplica. Antes de escalar horizontalmente, configure storage compartilhado compatível com `@nestjs/throttler`.

Registre somente IP normalizado e metadados mínimos; estabeleça retenção conforme a legislação aplicável.
