#include <unity.h>

#include <cstring>
#include <string>

#include "portal.h"

using namespace core::portal;

void setUp() {}
void tearDown() {}

static bool has(const std::string& s, const char* sub) { return s.find(sub) != std::string::npos; }

static void test_every_string_exists_in_both_languages() {
  for (int k = 0; k < kKeyCount; k++) {
    TEST_ASSERT_TRUE_MESSAGE(str(Lang::kEn, static_cast<Key>(k)).size() > 0, "missing EN string");
    TEST_ASSERT_TRUE_MESSAGE(str(Lang::kEs, static_cast<Key>(k)).size() > 0, "missing ES string");
  }
  TEST_ASSERT_EQUAL_STRING("", str(Lang::kEn, kKeyCount).c_str());
  // the blob walk lands on the right strings (first, middle, last)
  TEST_ASSERT_EQUAL_STRING("Set up your air sensor", str(Lang::kEn, kTitle).c_str());
  TEST_ASSERT_EQUAL_STRING("ZIP code", str(Lang::kEn, kZip).c_str());
  TEST_ASSERT_EQUAL_STRING("Afuera", str(Lang::kEs, kOutside).c_str());
  TEST_ASSERT_TRUE(str(Lang::kEs, kSafety).find("alarma de humo") != std::string::npos);
}

static void test_language_from_accept_language() {
  TEST_ASSERT_TRUE(pickLang("es-US,es;q=0.9,en;q=0.8") == Lang::kEs);
  TEST_ASSERT_TRUE(pickLang("ES-419") == Lang::kEs);
  TEST_ASSERT_TRUE(pickLang("en-US,es;q=0.5") == Lang::kEn);
  TEST_ASSERT_TRUE(pickLang("") == Lang::kEn);
  TEST_ASSERT_TRUE(pickLang("fr-FR") == Lang::kEn);
}

static void test_validate_good_form_picked_network() {
  Form f;
  auto e = validate({{"net", "Home"}, {"pass", "hunter22"}, {"address", " 12 Main St "}, {"zip", "10027"}, {"where", "inside"}}, f);
  TEST_ASSERT_EQUAL(0, e.size());
  TEST_ASSERT_EQUAL_STRING("Home", f.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("12 Main St", f.address.c_str());
  TEST_ASSERT_TRUE(f.indoor);
}

static void test_validate_other_network_open_and_default_outdoor() {
  Form f;
  auto e = validate({{"net", "__other__"}, {"ssid", " Hidden Net "}, {"pass", ""}, {"address", "1 A St"}, {"zip", "10001"}}, f);
  TEST_ASSERT_EQUAL(0, e.size());
  TEST_ASSERT_EQUAL_STRING("Hidden Net", f.ssid.c_str());
  TEST_ASSERT_FALSE(f.indoor);  // default outdoor
}

static void test_typed_name_wins_over_preticked_network() {
  Form f;
  auto e = validate({{"net", "Neighbor"}, {"ssid", " MyHidden "}, {"pass", "hunter22"}, {"address", "1 A St"}, {"zip", "10001"}}, f);
  TEST_ASSERT_EQUAL(0, e.size());
  TEST_ASSERT_EQUAL_STRING("MyHidden", f.ssid.c_str());
}

static void test_validate_errors() {
  Form f;
  auto e = validate({{"net", "__other__"}, {"ssid", ""}, {"pass", "short"}, {"address", "x"}, {"zip", "1002a"}}, f);
  TEST_ASSERT_EQUAL(4, e.size());
  TEST_ASSERT_EQUAL(kErrNeedSsid, e[0]);
  TEST_ASSERT_EQUAL(kErrPwLength, e[1]);
  TEST_ASSERT_EQUAL(kErrAddress, e[2]);
  TEST_ASSERT_EQUAL(kErrZip, e[3]);
  e = validate({{"net", std::string(33, 'x')}, {"pass", std::string(65, 'p')}, {"address", "1 A St"}, {"zip", "10001"}}, f);
  TEST_ASSERT_EQUAL(2, e.size());
}

static void test_hostile_ssid_and_values_are_escaped() {
  std::vector<Network> nets = {{"<script>alert(1)</script>", -50, true}, {"Quote\" onmouseover=\"x", -60, false}};
  Form v;
  v.address = "<img src=x>";
  std::string p = formPage(Lang::kEn, nets, v, {});
  TEST_ASSERT_FALSE(has(p, "<script>alert"));
  TEST_ASSERT_TRUE(has(p, "&lt;script&gt;alert(1)&lt;/script&gt;"));
  TEST_ASSERT_FALSE(has(p, "\" onmouseover=\"x\""));
  TEST_ASSERT_FALSE(has(p, "<img src=x>"));
  TEST_ASSERT_TRUE(has(p, "(open)"));
}

static void test_form_keeps_values_but_never_the_password() {
  Form v;
  v.ssid = "Home";
  v.password = "secretpw123";
  v.address = "12 Main St";
  v.zip = "10027";
  v.indoor = true;
  std::string p = formPage(Lang::kEn, {{"Home", -40, true}}, v, {kErrPassword});
  TEST_ASSERT_FALSE(has(p, "secretpw123"));
  TEST_ASSERT_TRUE(has(p, "value=\"12 Main St\""));
  TEST_ASSERT_TRUE(has(p, "value=\"Home\" checked"));
  TEST_ASSERT_TRUE(has(p, "value=\"inside\" checked"));
  TEST_ASSERT_TRUE(has(p, "That password didn&#39;t work"));  // apostrophes are HTML-escaped
}

static void test_pages_work_without_js_and_are_small() {
  std::vector<Network> nets;
  for (int i = 0; i < 20; i++) nets.push_back({"Network number " + std::to_string(i) + " with a long name", -40 - i, true});
  std::string f = formPage(Lang::kEs, nets, Form{}, {kErrNeedSsid, kErrZip});
  TEST_ASSERT_TRUE(has(f, "<form method=\"post\" action=\"/connect\">"));
  TEST_ASSERT_TRUE(has(f, "lang=\"es\""));
  TEST_ASSERT_FALSE(has(f, "http://") || has(f, "https://"));  // no external assets
  TEST_ASSERT_TRUE(f.size() < 12000);  // spec: < 20 KB gzipped; uncompressed is already well under
  std::string c = connectingPage(Lang::kEn);
  TEST_ASSERT_TRUE(has(c, "http-equiv=\"refresh\" content=\"3;url=/status\""));
  std::string d = donePage(Lang::kEn);
  TEST_ASSERT_TRUE(has(d, "You&#39;re all set!"));
  for (const std::string* s : {&f, &c, &d}) TEST_ASSERT_TRUE(has(*s, "smoke alarm") || has(*s, "alarma de humo"));
}

static void test_ap_name() {
  std::string code = fallbackShortCode(11001626u);
  TEST_ASSERT_EQUAL(6, code.size());
  TEST_ASSERT_EQUAL_STRING(code.c_str(), fallbackShortCode(11001626u).c_str());  // stable
  TEST_ASSERT_FALSE(code == fallbackShortCode(11001627u));
  std::string s = apSsid("ProseFire", "K7Q2MX");
  TEST_ASSERT_EQUAL_STRING("ProseFire-Setup-K7Q2MX", s.c_str());
  TEST_ASSERT_TRUE(apSsid(std::string(40, 'x'), "K7Q2MX").size() <= 32);
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_every_string_exists_in_both_languages);
  RUN_TEST(test_language_from_accept_language);
  RUN_TEST(test_validate_good_form_picked_network);
  RUN_TEST(test_validate_other_network_open_and_default_outdoor);
  RUN_TEST(test_typed_name_wins_over_preticked_network);
  RUN_TEST(test_validate_errors);
  RUN_TEST(test_hostile_ssid_and_values_are_escaped);
  RUN_TEST(test_form_keeps_values_but_never_the_password);
  RUN_TEST(test_pages_work_without_js_and_are_small);
  RUN_TEST(test_ap_name);
  return UNITY_END();
}
