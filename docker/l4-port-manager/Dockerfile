FROM docker:cli

# bash for scripting, jq + curl for direct-mode Docker API recreation
RUN apk add --no-cache bash jq curl

COPY docker/l4-port-manager/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
