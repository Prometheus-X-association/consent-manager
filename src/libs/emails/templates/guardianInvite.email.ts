const template = (vars: { [key: string]: string }) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Activate your account</title>
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
            button {
                background-color: #007bff;
                color: #fff;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                text-decoration: none;
                cursor: pointer;
            }
            button:hover {
                background-color: #0056b3;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h4>Activate your account</h4>
            <p>Hello ${vars.childName || ""},</p>
            <p>
                ${
                  vars.parentName || "A guardian"
                } has created an account for you and currently manages your
                consents. You can take control of this account by setting your
                own password.
            </p>
            <p>
                Click the button below, or copy the following url into your
                browser:<br />
                <a href='${vars.claimUrl}'>${vars.claimUrl}</a>
            </p>
            <a href='${
              vars.claimUrl
            }' style="display:inline-block; background-color:#007bff; color:#fff; padding:10px 20px; border-radius:5px; text-decoration:none;">Activate my account</a>
        </div>
    </body>
</html>
`;

export default template;
