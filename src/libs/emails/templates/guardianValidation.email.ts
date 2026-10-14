const template = (vars: { [key: string]: string }) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Guardianship request</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                padding: 20px;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            h4 { color: #333; }
            p { color: #666; }
            .btn {
                display: inline-block;
                background-color: #007bff;
                color: #fff;
                padding: 10px 20px;
                border-radius: 5px;
                text-decoration: none;
                margin-top: 12px;
            }
            .btn:hover { background-color: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <h4>Guardianship request</h4>
            <p>Hello ${vars.parentName || ""},</p>
            <p>
                A service has requested that you become the legal guardian of the
                account associated with <strong>${
                  vars.childEmail || ""
                }</strong>.
            </p>
            <p>
                If you approve this request, you will be able to manage consents
                on behalf of that account.
            </p>
            <p>
                Click the button below to review and confirm:
            </p>
            <a href='${vars.validateUrl}' class="btn">Confirm guardianship</a>
            <p style="margin-top:16px; font-size:12px; color:#999;">
                Or copy this URL into your browser:<br />
                <a href='${vars.validateUrl}'>${vars.validateUrl}</a>
            </p>
            <p style="font-size:12px; color:#999;">
                This link expires in 48 hours. If you did not expect this
                request, you can safely ignore this email.
            </p>
        </div>
    </body>
</html>
`;

export default template;
