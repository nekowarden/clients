FROM bitwarden/server

ENV ASPNETCORE_URLS http://+:5000
WORKDIR /app
EXPOSE 5000
COPY ./dist .
COPY entrypoint.sh /

RUN groupadd -g 999 bitwarden \
    && useradd -r -u 999 -g bitwarden bitwarden \
    && chown -R bitwarden:bitwarden /app \
    && mkdir -p /etc/bitwarden/web \
    && chown -R bitwarden:bitwarden /etc/bitwarden \
    && chmod +x /entrypoint.sh \
    && chown bitwarden:bitwarden /entrypoint.sh

USER bitwarden
ENTRYPOINT ["/entrypoint.sh"]
