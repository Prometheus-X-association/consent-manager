const template = (vars: { [key: string]: string }) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>An action was performed on your behalf</title>
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
            h4 {
                color: #333;
            }
            p {
                color: #666;
            }
            .detail {
                color: #333;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h4>An action was performed on your consents</h4>
            <p>Hello ${vars.childName || ""},</p>
            <p>
                <span class="detail">${vars.parentName || "A guardian"}</span>
                performed the following action on your behalf:
                <span class="detail">${vars.action || ""}</span>${
  vars.dataConsumerName ? ` (recipient: ${vars.dataConsumerName})` : ""
}.
            </p>
            <p>
                If you have any concerns about this action, please get in touch
                with your guardian.
            </p>
        </div>
    </body>
</html>
`;

export default template;
