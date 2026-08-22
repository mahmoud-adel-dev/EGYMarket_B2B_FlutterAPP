import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seals_app/core/constants/api_constants.dart';

void main() {
  test('uses the configured development API endpoint', () {
    dotenv.loadFromString(
      envString: '''
ENVIRONMENT=development
API_BASE_URL_LOCAL=http://localhost:3000/api
''',
    );

    expect(ApiConstants.baseUrl, 'http://localhost:3000/api');
  });
}
